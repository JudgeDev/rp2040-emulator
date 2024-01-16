// Run blink
import { RP2040 } from './rp2040';
import * as fs from 'fs';  // file system package
import { RPUART } from './utils/uart';

// Create an array with the compliled code of blink
// Execute the instructions from the array, one by one

console.log('Welcome to RP2040 emulator');
const hex = fs.readFileSync('src/hello_uart.hex', 'utf-8')
const mcu = new RP2040(hex);

const uart = new RPUART(mcu);
uart.onByte = value => {
    console.log(`UART sent: ${String.fromCharCode(value)}`);
};

mcu.PC = 0x10000354;  // start address of code
for (let i = 0; i < 280; i++) {
    mcu.executeInstruction();
}