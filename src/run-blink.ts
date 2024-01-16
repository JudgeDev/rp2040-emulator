// Run blink
import { RP2040 } from './rp2040';
import * as fs from 'fs';  // file system package

// Create an array with the compliled code of blink
// Execute the instructions from the array, one by one

console.log('Welcome to RP2040 emulator');
const hex = fs.readFileSync('src/hello_uart.hex', 'utf-8')
const mcu = new RP2040(hex);

const UART0_BASE = 0x40034000;
const UARTFR = 0x18;
const UARTDR = 0x00;

mcu.readHooks.set(UART0_BASE + UARTFR, () => 0);  // interecept address and return 0
mcu.writeHooks.set(UART0_BASE + UARTDR, (address, value) => {
    console.log(`UART value: ${String.fromCharCode(value & 0xff)} written to ${address.toString(16)}`)
});  // interecept address and return 0

mcu.PC = 0x354;  // start address of code
for (let i = 0; i < 280; i++) {
    mcu.executeInstruction();
}