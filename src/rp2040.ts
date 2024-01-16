export const FLASH_START_ADDRESS = 0x10000000;
export const RAM_START_ADDRESS = 0x20000000;
export const SIO_START_ADDRESS = 0xd0000000;
export const SIO_LENGTH        = 0x10000000;
// flag positions
// export const APSR_N = 0x80000000;
// export const APSR_Z = 0x40000000;
// export const APSR_C = 0x20000000;

// arm shift types
const enum SRType {SRType_LSL, SRType_LSR, SRType_ASR, SRType_ROR, SRType_RRX};

// callback type definition
export type ICPUReadCallback = (address: number) => number;
export type ICPUWriteCallback = (address: number, value: number) => void;

export class RP2040 {
    // Flash 16kb starting at 0x10000
    readonly flash = new Uint8Array(16 * 1024);
    readonly flash16 = new Uint16Array(this.flash.buffer);  // 16-bit instruction memory mapped to flash in little endian
    readonly flashView = new DataView(this.flash.buffer);  // view of flash for accessing multiple bytes
    
    // SRAM 264kb starting at 0x20000000
    readonly sram = new Uint8Array(264 * 1024);  // rp2040 ram size
    readonly sramView = new DataView(this.sram.buffer);  // view of sram for accessing multiple bytes

    // registers 
    readonly registers = new Uint32Array(16);  // ARMv6 manual, §B1.4 (LC1,22:45)
    
    // flags for the program status register - ARMv6 manual, §A2.3.2
    public N: boolean = false;  
    public Z: boolean = false;  
    public C: boolean = false;  
    public V: boolean = false;

    // map IO addresses to callback functions
    readonly readHooks = new Map<number, ICPUReadCallback>();
    readonly writeHooks = new Map<number, ICPUWriteCallback>();

    constructor(hex: string) {  // pass program hex
        this.SP = 0x20041000;  // initial value of stack pointer - ref ??
        this.flash.fill(0xff);
        this.loadHex(hex, this.flash);
    }

    get SP() {  // stack pointer
        return this.registers[13];
    }
    set SP(value: number) {
        this.registers[13] = value;
    }
    get LR() {  // link register
        return this.registers[14];
    }
    set LR(value: number) {
        this.registers[14] = value;
    }
    get PC() {  // program counter
        return this.registers[15];
    }
    set PC(value: number) {
        this.registers[15] = value;
    }

    checkCondition(cond: number) {
        // uses condition specifier and the APSR condition flags to determine
        // whether the instruction must be executed - ARMv6 manual, §A6.3.1
        let result = false;
        switch (cond >> 1) {  // check three highest bits
            case 0b000:
                result = this.Z;  // EQ or NE
                break;
            case 0b001:
                result = this.C;  // CS or CC
                break;
            case 0b010:
                result = this.N;  // MI or PL
                break;
            case 0b011:
                result = this.V;  // VS or VC
                break;
            case 0b100:
                result = this.C && !this.Z;  // HI or LS
                break;
            case 0b101:
                result = this.N === this.V;  // GE or LT
                break;
            case 0b110:
                result = (this.N === this.V) && !this.V;  // GT or LE
                break;
            case 0b111:
                result = true;  // AL
                break;
        }
        // Condition flag values in the set 111x indicate the instruction is always executed
        // Otherwise, invert condition if necessary
        return (cond & 0b1) && cond != 0b1111 ? !result : result
    }

    writeUint32(address: number, value: number) {
        // if address is in sram, write value little endian
        if (address >= RAM_START_ADDRESS && address < RAM_START_ADDRESS + this.sram.length) {
            this.sramView.setUint32(address - RAM_START_ADDRESS, value, true);
        }
        else if (address >= SIO_START_ADDRESS && address < SIO_START_ADDRESS + SIO_LENGTH) {
            // SIO write
            const sioAddress = address - SIO_START_ADDRESS;
            let pinList: number[] = [];
            for (let i = 0; i < 32; i++) {
                if (value & (1 << i)) {
                    pinList.push(i);
                }
            }
            if (sioAddress === 20) {
                console.log(`GPIO pins ${pinList} set to HIGH`);
            }
            else if (sioAddress === 24) {
                console.log(`GPIO pins ${pinList} set to LOW`);
            }
            else {
                console.log('someone wrote', value.toString(16), 'to', sioAddress);
            }
        } else {
            const hook = this.writeHooks.get(address);
            if (hook) {
                return hook(address, value);
            }
        }
    }

    readUint32(address: number): number {
        // return word at flash/ram address little endian
        if (address < FLASH_START_ADDRESS) {
            // TODO: should be reading from bootrom
            return this.flashView.getUint32(address, true);
        } else if (address >= FLASH_START_ADDRESS && address < RAM_START_ADDRESS) {
            return this.flashView.getUint32(address - FLASH_START_ADDRESS, true);
        } else if (address >= RAM_START_ADDRESS && address < RAM_START_ADDRESS + this.sram.length) {
            return this.sramView.getUint32(address - RAM_START_ADDRESS, true);
        } else {
            const hook = this.readHooks.get(address);
            if (hook) {
                return hook(address);
            }
        }
        // TODO: implement SIO space reads
        console.warn(`Read from invalid memory address ${address.toString(16)}`);
        return 0xffffffff;
    }
    readUint16(address: number): number {
        // return 16 halfword at address
        return this.readUint32(address) & 0xffff;
    }

    // pseudocode implementations - ARMv6 manual, §D5
    SignExtend16(x: number, i: number): number {  // sign extend 16 bits to i bits
        // currently performs fixed 16 to 32 bit extension
        return x & 0x8000 ? 0xffff0000 + (x & 0x7fff) : x;  // if negative extend sign
    }
    LSL_C(x: number, shift: number): [number, number] {
        const extended_x = x << shift;
        const result = extended_x & 0xffffffff;  // use lowest 32 bits
        const carry_out = x & (0x1 << (32 - shift));
        return [result, carry_out];
    }
    Shift_C(value: number, type: SRType, amount: number, carry_in: number): [number, number] {
        switch (type) {
            case SRType.SRType_LSL:
                return this.LSL_C(value, amount);
            default:
                console.warn(`Shift_C does not currently handle SRType: ${type}`);
        }
        return [0,0];
    }
    DecodeImmShift(type: number, imm5: number): [SRType, number] {
        switch (type) {
            case 0:
                return [SRType.SRType_LSL, imm5];
            case 1:
                return [SRType.SRType_LSR, imm5 == 0 ? 32 : imm5];
            case 2:
                return [SRType.SRType_ASR, imm5 == 0 ? 32 :imm5];
            case 3:
                if (imm5 === 0) {
                    return [SRType.SRType_RRX, 1];
                } else {
                    return [SRType.SRType_ROR, imm5];
                }
        }
        return [SRType.SRType_ASR, 0];  // dummy return to satisfy typescript
    }
    AddWithCarry(x: number, y: number, carry_in: number): number {
        //console.log(x, y, x.toString(16), y.toString(16), carry_in);
        const sum = (x >>> 0) + (y >>> 0) + carry_in;  // lowest 32 bits summed normally
        const signed_sum = (x >> 0) + (y >> 0) + (carry_in >> 0);  // summed as 32-bit signed numbers
        const result = sum >>> 0;  // lowest 32 bits
        //console.log(signed_sum, sum.toString(16), (sum >> 0).toString(16), result.toString(16));
        this.C = !(result === sum);
        this.V = !((sum >> 0) === signed_sum);
        this.N = !!(result & 0x80000000);
        this.Z = result === 0;  // bottom 32 bits zero
        return result;
     }

    executeInstruction() {
        // instruction set at ??
        // ARM Thumb instruction encoding - 16 bits / 2 bytes
        const opcode = this.readUint16(this.PC);  // RP2040 is little endian
        const opcode2 = this.readUint16(this.PC + 1);  // RP2040 is little endian
        // Increment the PC by 2 for a simple instruction
        //console.log(`${this.PC.toString(16)}: ${opcode.toString(16)} ${this.registers[2].toString(16)}`);
        this.PC += 2;

        // PUSH - ARMv6 manual, §A6.7.50
        if (opcode >> 9 === 0b1011010) {  
            //console.log('push instruction');
            /*
            address = SP - 4*BitCount(registers);
            for i = 0 to 14
                if registers<i> == '1' then
                    MemA[address,4] = R[i];
                    address = address + 4;
            SP = SP - 4*BitCount(registers)
            */
            let bitCount = 0;  //  number of register bits set
            for (let i = 0; i <=8; i++) {
                if (opcode & (1 << i)) {
                    bitCount++;
                }
            }
            let address = this.SP - 4 * bitCount;  // address of first push
            for (let i = 0; i <= 7; i++) {  // cycle through register flags
                if (opcode & (1 << i)) {  // test for regiser flag set
                    this.writeUint32(address, this.registers[i]);  // copy four bytes little endian
                    address += 4;
                }
            }
            if (opcode & (1 << 8)) {
                this.writeUint32(address, this.registers[14]);  // push LR register little endian
            }
            this.SP -= 4 * bitCount;
        }
        // MOVS - ARMv6 manual, §A6.7.39
        else if (opcode >> 11 === 0b00100) {
            //console.log('movs instruction')
            /*
            // update status flags (if InITBlock)?
            result = imm32;
            R[d] = result;
            if setflags then
            APSR.N = result<31>;
            APSR.Z = IsZeroBit(result);
            APSR.C = carry;
             // APSR.V unchanged
            */
            const value = opcode & 0xff;
            const Rd = (opcode >> 8) & 7;
            this.registers[Rd] = value;
            this.N = !!(value & 0x80000000);
            this.Z = value === 0;            
        }
        // BL - ARMv6 manual, §A6.7.13
        else if ((opcode >> 11 === 0b11110) && (opcode2 >> 14 === 0b11)) {
            console.log('BL ignored');
            this.PC += 2  // double word instruction
        }
        // B - ARMv6 manual, §A6.7.10
        // encoding T2
        else if (opcode >> 11 === 0b11100) {
            let imm32 = (opcode & 0x7ff) << 1;  // sign extend
            if (imm32 & (1 << 11)) {  // negative
                imm32 = (imm32 & 0x7ff) - 0x800;  // twos complement?
            }
            this.PC += imm32 + 2;  // allow for adding 2 at end of instruction??
        }
        // encoding T1 (with cond)
        else if (opcode >> 12 === 0b1101) {
            let imm32 = (opcode & 0xff) << 1;  // sign extend
            const cond = (opcode >> 8) & 0xf;
            if (imm32 & (1 << 8)) {  // negative
                imm32 = (imm32 & 0x1ff) - 0x200;  // twos complement?
            }
            //console.log((this.PC + imm32 + 2 + 2).toString(16));
            if (this.checkCondition(cond)) {
                this.PC += imm32 + 2;  // allow for adding 2 at end of instruction??
            }
        }
        // STR - ARMv6 manual, §A6.7.59
        else if (opcode >> 11 === 0b01100) {
            /*
            offset_addr = if add then (R[n] + imm32) else (R[n] - imm32);
            address = if index then offset_addr else R[n];
            MemU[address,4] = R[t];
            if wback then R[n] = offset_addr;
            */
            const imm5 = ((opcode >> 6) & 0x1f) << 2;  // imm32 is zero extended by two bits
            const Rn = (opcode >> 3) & 0x7;
            const Rt = opcode & 0x7;
            const address = this.registers[Rn] + imm5;
            this.writeUint32(address, this.registers[Rt]);  // store register value
        }
        // LDR (literal) - ARMv6 manual, §A6.7.27
        else if (opcode >> 11 === 0b01001) {
            const imm32 = (opcode & 0xff) << 2;
            const Rt = (opcode >> 8) & 0x7;
            // from ARM manual A4.2.1: add 4 bytes and then align to 4 bytes
            // (also from ARM manual Align(x,y) = y * (x DIV y))
            // i.e. alignedPC = 4 * Math.floor(PC / 4);
            const PC = this.PC + 2;
            const alignedPC = PC & 0xfffffffc;
            this.registers[Rt] = this.readUint32(alignedPC + imm32);
        }
        // LDR (immediate) - ARMv6 manual, §A6.7.26 - Vid 2 @55:02
        // encoding T1
        else if (opcode >> 11 === 0b01101) {
            const imm32 = ((opcode >> 6) & 0x1f) << 2;
            const Rt = opcode & 0x7;
            const Rn = (opcode >> 3) & 0x7;
            const addr = this.registers[Rn] + imm32;
            //console.log(`Reading from: ${addr.toString(16)}`);
            this.registers[Rt] = this.readUint32(addr);
        }
        // LDRB (immediate) - ARMv6 manual, §A6.7.29
        // encoding T1
        else if (opcode >> 11 === 0b01111) {
            const imm32 = (opcode >> 6) & 0x1f;
            const Rt = opcode & 0x7;
            const Rn = (opcode >> 3) & 0x7;
            const addr = this.registers[Rn] + imm32;
            this.registers[Rt] = this.readUint32(addr) & 0xff;  // get byte
        }
        // LDRSH - ARMv6 manual, §A6.7.34
        else if (opcode >> 9 === 0b0101111) {
            const Rm = (opcode >> 6) & 0x7;  // offset
            const Rn = (opcode >> 3) & 0x7;  // base
            const Rt = opcode & 0x7;  // dest
            const offset = this.registers[Rm];
            const offset_addr = this.registers[Rn] + offset;
            let data = this.readUint32(offset_addr)
            data &= 0xffff;  // get half word
            data = this.SignExtend16(data, 32);  // sign extend to 32 bits 
            this.registers[Rt] = data;
        }
        // LSLS - ARMv6 manual, §A6.7.35 (also covers MOVS rx, ry)
        else if (opcode >> 11 === 0) {
            const imm5 = (opcode >> 6) & 0x1f;
            const Rm = (opcode >> 3) & 0x7;
            const Rd = opcode & 0x7;
            const [_, shift_n] = this.DecodeImmShift(0, imm5);
            const [result, carry] = this.Shift_C(this.registers[Rm], SRType.SRType_LSL, shift_n, +this.C);
            this.registers[Rd] = result;
            this.N = !!(result & 0x80000000);
            this.Z = result === 0;
            this.C = !!carry;
            // APSR.V unchanged
        }                
        // TST - ARMv6 manual, §A2.3.2 - Vid 2 @1:06:41
        else if (opcode >> 6 === 0b0100001000) {
            const Rn = opcode & 0x7;
            const Rm = (opcode >> 3) & 0x7;
            const result = this.registers[Rm] & this.registers[Rn];
            this.N = !!(result & 0x80000000);
            this.Z = result === 0;
        }
        // CMP (immediate) # §A6.7.17
        else if (opcode >> 11 === 0b00101) {
            const imm32 = opcode & 0xff;
            const Rn = (opcode >> 8) & 0x7;
            this.AddWithCarry(this.registers[Rn], ~imm32 >>> 0, 1);
        }
        // CMP (register) T1 # §A6.7.18
        else if (opcode >> 6 === 0b0100001010) {
            const Rm = (opcode >> 3) & 0x7;
            const Rn = opcode & 0x7;
            this.AddWithCarry(this.registers[Rn], ~this.registers[Rm] >>> 0, 1);
        }
        // ADCS (register) # §A6.7.1
        // only T1
        else if (opcode >> 6 === 0b0100000101) {
            const imm32 = opcode & 0xff;
            const Rm = (opcode >> 3) & 0x7;
            const Rn = opcode & 0x7;
            this.registers[Rn] = this.AddWithCarry(this.registers[Rm], this.registers[Rn], +this.C);
        }
        // ADDS (immediate) # §A6.7.2
        // TODO: T1
        // T2
        else if (opcode >> 11 === 0b00110) {
            const imm32 = opcode & 0xff;
            const Rdn = (opcode >> 8) & 0x7;
            this.registers[Rdn] = this.AddWithCarry(this.registers[Rdn], imm32, 0);
        }
        // SUBS (immediate) # §A6.7.65
        // TODO: T1
        // T2
        else if (opcode >> 11 === 0b00111) {
            const imm32 = opcode & 0xff;
            const Rdn = (opcode >> 8) & 0x7;
            this.registers[Rdn] = this.AddWithCarry(this.registers[Rdn], ~imm32 >>> 0, 1);
        }
        // RSBS (immediate) # §A6.7.55 = NEG §A6.7.46
        else if (opcode >> 6 === 0b0100001001) {
            const imm32 = 0;
            const Rn = (opcode >> 3) & 0x7;
            const Rd = opcode & 0x7;
            this.registers[Rd] = this.AddWithCarry(imm32, ~this.registers[Rn] >>> 0, 1);
        }
        // UXTB §A6.7.73
        else if (opcode >> 6 === 0b1011001011) {
            const Rm = (opcode >> 3) & 0x7;
            const Rd = opcode & 0x7;
            this.registers[Rd] = this.registers[Rm] & 0xff
        }              
        else {
            console.log(`Warning: Instruction ${opcode.toString(16)} at ${(this.PC - 2).toString(16)} not implemented`);
        }
    }

    // Function to load Intel HEX file into memory (L1,26:18)
    private loadHex(hex: string, memory: Uint8Array): void {
        /* hex format:
        [0]     ":" - Start of a record                                     
        [1]-[2] Record length
        [3]-[6] Load address
        [7]-[8] Record type
        [9]-[n] Actual data                                           
        Last two characters  =  Checksum (i.e., sum of all bytes checksum = 00)
        */  
        const lines = hex.split('\n');

        for (const line of lines) {
            if (line.startsWith(':')) {
                const byteCount = parseInt(line.substring(1, 3), 16);
                const address = parseInt(line.substring(3, 7), 16);
                const recordType = parseInt(line.substring(7, 9), 16);

                if (recordType === 0x00) {
                    // Data record
                    for (let i = 0; i < byteCount; i++) {
                        const dataByte = parseInt(line.substring(9 + i * 2, 11 + i * 2), 16);
                        memory[address + i] = dataByte;
                    }
                } else if (recordType === 0x01) {
                    // End of File record
                    break;
                }
                // Handle other record types if necessary
            }
        }
    }
}
