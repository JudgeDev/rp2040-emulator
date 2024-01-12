// Run blink
import { RP2040 } from './rp2040';
import * as fs from 'fs';  // file system package

// Create an array with the compliled code of blink
// Execute the instructions from the array, one by one

console.log('Welcome to RP2040 emulator');
const hex = fs.readFileSync('src/hello_uart.hex', 'utf-8')
const mcu = new RP2040(hex);

mcu.readHooks.set(0x40034018, () => 0);  // interecept address and return 0

mcu.PC = 0x354;  // start address of code
for (let i = 0; i < 60; i++) {
    mcu.executeInstruction();
}