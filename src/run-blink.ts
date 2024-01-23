// Run blink
import { RP2040, SRAM_BASE, XIP_BASE } from './rp2040';
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

/*
Bootrom overview (RP datasheet §2.7):
boot sequence:
PC = 0x4 in bootrom in bootrom.dis/bootrom_rt0.S
Jump to 0xea in bootrom
main() -> flash_boot() in bootrom_main.c
    - 0 to LR
    - copy BOOT2_SIZE_BYTES from flash to end of sram
-> _stage2_boot in boot2_w25q080.s
-> soft_reset -> XIP_BASE + 0x101 i.e. _reset_start in the program
*/
/* To start from _stage2_boot
mcu.LR = 0;
const BOOT2_SIZE_BYTES = 256;
// copy  boot2 code at beginning of flash to end of sram
mcu.sram.set(mcu.flash.slice(0, BOOT2_SIZE_BYTES), mcu.sram.length - BOOT2_SIZE_BYTES);
// skip bootrom and jump straight to boot2
mcu.PC = SRAM_BASE + mcu.sram.length - BOOT2_SIZE_BYTES;
*/

// To start after stage2 boot at _reset_start
mcu.PC = 0x100001e8;  // _entry_point in hello_uart.dis
//mcu.PC = 0x10000354;  // _main in hello_uart.dis

for (let i = 0; i < 10; i++) {
    mcu.executeInstruction();
}
