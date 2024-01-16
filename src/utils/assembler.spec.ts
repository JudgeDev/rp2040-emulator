import { opcodeADDS2, opcodeSUBS2, opcodeRSBS, opcodeLDRB, opcodeADCS, opcodeUXTB} from "./assembler";

describe('assembler', () => {
    it('encode an `adcs r3, r0` instruction', () => {
        expect(opcodeADCS(3, 0)).toEqual(0x4143);
    });    
    it('encode an `adds r1, #1` instruction', () => {
        expect(opcodeADDS2(1, 1)).toEqual(0x3101);
    });
    it('encode an `subs r3, #13` instruction', () => {
        expect(opcodeSUBS2(3, 13)).toEqual(0x3b0d);
    });
    it('encode an `rsbs r0, r3 #0` instruction', () => {
        expect(opcodeRSBS(0, 3)).toEqual(0x4258);
    });
    it('encode an `ldrb r0, [r1, #0]` instruction', () => {
        expect(opcodeLDRB(0, 1, 0)).toEqual(0x7808);
    });

    it('encode an `uxtb	r3, r3` instruction', () => {
        expect(opcodeUXTB(3, 3)).toEqual(0xb2db);
    });
});