// Run blink
import { RP2040 } from './rp2040';
import * as fs from 'fs';  // file system package

// Create an array with the compliled code of blink
// Execute the instructions from the array, one by one

console.log('Welcome to RP2040 emulator');
const hex = fs.readFileSync('src/blink.hex', 'utf-8')
const mcu = new RP2040(hex);
mcu.PC = 0x370;
for (let i = 0; i < 16; i++) {
    mcu.executeInstruction();
}