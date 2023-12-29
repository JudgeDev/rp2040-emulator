export const RAM_START_ADDRESS = 0x20000000;
export const SIO_START_ADDRESS = 0xd0000000;
export const SIO_LENGTH        = 0x10000000;

export class RP2040 {
    // Flash 16kb starting at 0x10000
    readonly flash = new Uint8Array(16 * 1024);
    readonly flash16 = new Uint16Array(this.flash.buffer);  // 16-bit instruction memory mapped to flash in little endian
    
    // SRAM 264kb starting at 0x20000000
    readonly sram = new Uint8Array(264 * 1024);  // rp2040 ram size
    readonly sramView = new DataView(this.sram.buffer);  // view of sram for accessing multiple bytes

    // registers ARMv6 manual, §B1.4 (LC1,22:45)
    readonly registers = new Uint32Array(16);

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

    writeUint32(address: number, value: number) {
        // if address is in sram, write value little endian
        if (address > RAM_START_ADDRESS && address < RAM_START_ADDRESS + this.sram.length) {
            this.sramView.setUint32(address - RAM_START_ADDRESS, value, true);
        }
        if (address > SIO_START_ADDRESS && address < SIO_START_ADDRESS + SIO_LENGTH) {
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
        }
    }
        
    executeInstruction() {
        // instruction set at ??
        // ARM Thumb instruction encoding - 16 bits / 2 bytes
        const opcode = this.flash16[this.PC / 2];  // RP2040 is little endian
        const opcode2 = this.flash16[this.PC / 2 + 1];  // RP2040 is little endian
        //console.log(opcode.toString(16));
        
        // PUSH - ARMv6 manual, §A6.7.50
        if (opcode >> 9 === 0b1011010) {  
            //console.log('push instruction');
            /*
            address = SP - 4*BitCount(registers);
            for i = 0 to 14
                if registers<i> == ‘1’ then
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

        }
        // LSLS (also covers MOVS rx, ry)
        else if (opcode >> 11 === 0) {
            //console.log('lsls instruction');
            /*
            (result, carry) = Shift_C(R[m], SRType_LSL, shift_n, APSR.C);
            R[d] = result;
            if setflags then
                APSR.N = result<31>;
                APSR.Z = IsZeroBit(result);
                APSR.C = carry;
                // APSR.V unchanged
            */
            const imm5 = (opcode >> 6) & 0x1f;
            const Rm = (opcode >> 3) & 0x7;
            const Rd = opcode & 0x7;
            this.registers[Rd] = this.registers[Rm] << imm5
        }
        // BL - ARMv6 manual, §A6.7.13
        else if ((opcode >> 11 === 0b11110) && (opcode2 >> 14 === 0b11)) {
            console.log('BL ignored');
        }
        // B - ARMv6 manual, §A6.7.10
        else if (opcode >> 11 === 0b11100) {
            let imm32 = (opcode & 0x7ff) << 1;  // sign extend
            if (imm32 & (1 << 11)) {  // negative
                imm32 = (imm32 & 0x7ff) - 0x800;  // twos complement?
            }
            this.PC += imm32 + 2;  // allow for adding 2 at end of instruction??
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
        /*
        else {
            // Example: Handle a simple instruction (this is just a placeholder)
            switch (opcode & 0xF800) {
                case 0x2000:
                    // Handle a specific Thumb instruction
                    // Example: Increment the PC by 2 for a simple instruction
                    //this.PC += 2;
                    break;
                // Add more cases for different instructions
                default:
                    // Handle unknown or unimplemented instructions
                    console.error(`Unknown instruction: ${opcode.toString(16)}`);
                    break;
            }
        }
        */

        // Example: Increment the PC by 2 for a simple instruction
        this.PC += 2;
 
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
