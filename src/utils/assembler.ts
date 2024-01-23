export function opcodeADCS(Rdn: number, Rm: number): number {
    return 0b0100000101 << 6 | (Rm & 7) << 3 | Rdn & 7
};

export function opcodeADDS2(Rdn: number, imm8: number): number {
    return 0b00110 << 11 | (Rdn & 7) << 8 | imm8 & 0xff
};

export function opcodeSUBS2(Rdn: number, imm8: number): number {
    return 0b00111 << 11 | (Rdn & 7) << 8 | imm8 & 0xff
};

export function opcodeRSBS(Rd: number, Rn: number): number {
    return 0b0100001001 << 6 | (Rn & 7) << 3 | Rd & 7
};

export function opcodeLDRB(Rt: number, Rn: number, imm5: number): number {
    return 0b01111 << 11 | (imm5 & 0x1f) << 6 | (Rn & 7) << 3 | Rt & 7
};

export function opcodeUXTB(Rd: number, Rm: number): number {
    return 0b1011001011 << 6 | (Rm & 7) << 3 | Rd & 7
};

export function opcodeBL(imm32: number): number {
    const imm11 = (imm32 >> 1) & 0x7ff;
    const imm10 = (imm32 >> 12) & 0x3ff;
    const s = imm32 < 0 ? 1 : 0;
    const j2 = (~(imm32 >> 22) & 0b1) ^ s;
    const j1 = (~(imm32 >> 23) & 0b1) ^ s;
    //const opcode = 0b11110 << 27 | s << 26 | imm10 << 16 | 0b11 << 14 | j1 << 13 | 0b1 << 12 | j2 << 11 | imm11;
    const opcode = 0b11110 << 11 | s << 10 | imm10 | 0b11 << 30 | j1 << 29 | 0b1 << 28 | j2 << 27 | imm11 << 16;
    return opcode >>> 0;
};

export function opcodeLSRS(Rd: number, Rm: number, imm5: number): number {
    return 0b00001 << 11 | (imm5 & 0x1f) << 6 | (Rm & 7) << 3 | Rd & 7
};

export function opcodeLDMIA(Rn: number, registers: number[]): number {
    let register_list = 0  // byte for registers
    for (let i = 0; i < registers.length; i++) {
        register_list += 0b1 << registers[i]  // get register number and set bit
    }
    return 0b11001 << 11 | (Rn & 0x7) << 8 | register_list;
};