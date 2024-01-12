import {RAM_START_ADDRESS, RP2040 } from './rp2040';

const r0 = 0;
const r1 = 1;
const r2 = 2;
const r3 = 3;
const r4 = 4;
const r5 = 5;
const r6 = 6;
const r7 = 7;


describe('RP2040', () => {
    describe('executeInstruction', () => {
        it('should execute a `push {r4, r5, r6, lr}` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.SP = RAM_START_ADDRESS + 0x100;
            rp2040.flash16[0] = 0x0b570;  // push {r4, r5, r6, lr}
            rp2040.registers[r4] = 0x40;
            rp2040.registers[r5] = 0x50;
            rp2040.registers[r6] = 0x60;
            rp2040.LR = 0x42;
            rp2040.executeInstruction();
            // assert that the values of r4, r5, r6, lr were pushed into the stack
            expect(rp2040.SP).toEqual(RAM_START_ADDRESS + 0xf0);
            expect(rp2040.sram[0xf0]).toEqual(0x40);
            expect(rp2040.sram[0xf4]).toEqual(0x50);
            expect(rp2040.sram[0xf8]).toEqual(0x60);
            expect(rp2040.sram[0xfc]).toEqual(0x42);
        });
        it('should execute a `movs r5, #128` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x2580;  // movs r5, #128
            rp2040.executeInstruction();
            // assert that 128 was stored in register 5
            expect(rp2040.registers[r5]).toEqual(128);
            expect(rp2040.PC).toEqual(2);
        });
        it('should execute a `movs r6, r5` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x002e;  // movs r6, r5
            rp2040.registers[r5] = 0x50;
            rp2040.executeInstruction();
            // assert that r5 was copied to r6 (actually uses the lsls opcode)
            expect(rp2040.registers[r6]).toEqual(0x50);
            expect(rp2040.PC).toEqual(2);
        });

        it('should execute a `str r6, [r4, #20]` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x6166;  // str r6, [r4, #20]
            rp2040.registers[r6] = 0xf00d;
            rp2040.registers[r4] = RAM_START_ADDRESS + 0x20;
            rp2040.executeInstruction();
            // assert that r6 has been stored in r4 +20
            expect(rp2040.sramView.getUint32(0x20 + 20, true)).toEqual(0xf00d);
            expect(rp2040.PC).toEqual(2);
        });
        it('should execute a `b.n -20` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 12 * 2;
            rp2040.flash16[12] = 0xe7f6;  // b.n -20
            rp2040.executeInstruction();
            // assert that program counter has gone back 20
            expect(rp2040.PC).toEqual(8);
        });
        it('should execute a `bne.n	10000374` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 9 * 2;
            rp2040.flash16[9] = 0xd1fc;  // bne.n	10000374
            rp2040.executeInstruction();
            // assert that program counter has gone back 6
            expect(rp2040.PC).toEqual(14);
        });
        it('should execute an `ldr r0, [pc, #148]` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x4825;  // ldr r0, [pc, #148]
            rp2040.flash[148] = 0x42;
            rp2040.flash.fill(0, 149, 152);
            rp2040.registers[r0] = 0x50;
            rp2040.executeInstruction();
            // assert that r0 contains flash value 
            expect(rp2040.registers[r0]).toEqual(0x42);
        });
        it('should execute an `ldr r3, [r2, #24]` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x6993;  // ldr r3, [r2, #24]
            rp2040.registers[r2] = RAM_START_ADDRESS;
            rp2040.sram[24] = 0x55;
            rp2040.executeInstruction();
            // assert that r3 contains sram value 
            expect(rp2040.registers[r3]).toEqual(0x55);
        });
        it('should execute an `ldrsh r5, [r3, r5]` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x5f5d;  // ldrsh r5, [r3, r5]
            rp2040.registers[r3] = RAM_START_ADDRESS;  // base
            rp2040.registers[r5] = 0x50;  // offset
            rp2040.writeUint32(RAM_START_ADDRESS + 0x50, 0x12348678);  // put negative half word at offset address
            rp2040.executeInstruction();
            // assert that r5 contains negative half word at memory address 
            expect(rp2040.registers[r5]).toEqual(0xffff0678);
        });
        it('should execute a `lsls r5, r5, #18` instruction', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x04ad;  // lsls r5, r5, #18
            rp2040.registers[r5] = 0x3;
            rp2040.executeInstruction();
            // assert that r5 has been shifted left 18 places
            expect(rp2040.registers[5]).toEqual(0x3 * (2 ** 18));
            expect(rp2040.C).toEqual(false);
            expect(rp2040.PC).toEqual(2);
        });               
        it('should execute a `lsls r5, r5, #18` instruction with carry', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x04ad;  // lsls r5, r5, #18
            rp2040.registers[r5] = 0x00004001;
            rp2040.executeInstruction();
            // assert that r5 has been shifted left 18 places
            expect(rp2040.registers[5]).toEqual(0x40000);
            expect(rp2040.C).toEqual(true);
            expect(rp2040.PC).toEqual(2);
        });
        it('should execute an `tst r1, r3` instruction when result is negative', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x4219;  // tst r1, r3
            rp2040.registers[r1] = 0xf0000000;
            rp2040.registers[r3] = 0xf0004000;
            rp2040.sram[24] = 0x55;
            rp2040.executeInstruction();
            // assert that N flag is set
            expect(rp2040.N).toEqual(true);
        });
        it('should execute an `tst r1, r3` instruction result is zero', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x4219;  // tst r1, r3
            rp2040.registers[r1] = 0;
            rp2040.registers[r3] = 55;
            rp2040.sram[24] = 0x55;
            rp2040.executeInstruction();
            // assert that Z flag is set
            expect(rp2040.Z).toEqual(true);
        });
        it('should execute an `cmp r5, #66` instruction result is zero', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x2d42;  // cmp r5, #66
            rp2040.registers[r5] = 66;
            rp2040.executeInstruction();
            // assert that Z flag is set
            expect(rp2040.Z).toEqual(true);
            expect(rp2040.N).toEqual(false);
            expect(rp2040.C).toEqual(true);  // see note at end of §A2.2.1
            expect(rp2040.V).toEqual(false);
        });
        it('should execute an `cmp r5, #66` instruction result is positive', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x2d42;  // cmp r5, #66
            rp2040.registers[r5] = 68;
            rp2040.executeInstruction();
            // assert that Z flag is set
            expect(rp2040.Z).toEqual(false);
            expect(rp2040.N).toEqual(false);
            expect(rp2040.C).toEqual(true);  // see note at end of §A2.2.1
            expect(rp2040.V).toEqual(false);
        });
        it('should execute an `cmp r5, #66` check 60 - 66', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x2d42;  // cmp r5, #66
            rp2040.registers[r5] = 60;
            rp2040.executeInstruction();
            // assert that Z flag is set
            expect(rp2040.Z).toEqual(false);
            expect(rp2040.N).toEqual(true);
            expect(rp2040.C).toEqual(false);
            expect(rp2040.V).toEqual(false);
        });
        // TODO: need more tests for add with carry
        it('should test carry on adding with carry', () => {
            const rp2040 = new RP2040('');
            const x = 0xffff0000;  // high unsigned number
            const y = 0x1ffff;  // 
            const carry_in = 0;
            const [result, carry_out, overlfow] = rp2040.AddWithCarry(x, y, carry_in);
            // assert result
            expect(result).toEqual(0x10000ffff);
            expect(carry_out).toEqual(1);
            expect(overlfow).toEqual(0);  // but no overflow
        });
        it('should test overflow on adding with carry', () => {
            const rp2040 = new RP2040('');
            const x = 0x7fffffff; // max positive number
            const y = 0x2;  // add positive number
            const carry_in = 0;
            const [result, carry_out, overlfow] = rp2040.AddWithCarry(x, y, carry_in);
            // assert overflow
            expect(result).toEqual(0x80000001);
            expect(overlfow).toEqual(1);
            expect(carry_out).toEqual(0);  // but no carry error
        });
        it('should execute an `cmp r5, r0` instruction result is positive', () => {
            const rp2040 = new RP2040('');
            rp2040.PC = 0;
            rp2040.flash16[0] = 0x4285;  // cmp r5, r0
            rp2040.registers[r5] = 60;
            rp2040.registers[r0] = 56;
            rp2040.executeInstruction();
            // assert that Z flag is set
            expect(rp2040.Z).toEqual(false);
            expect(rp2040.N).toEqual(false);
            expect(rp2040.C).toEqual(true);  // see note at end of §A2.2.1
            expect(rp2040.V).toEqual(false);
        });
    });
});