import { RP2040 } from "../rp2040";

export const UART0_BASE = 0x40034000;
export const UART1_BASE = 0x40038000;

const UARTDR = 0x00;
const UARTFR = 0x18;

export class RPUART {
    public onByte?: (value: number) => void;
    // called when byte written to uart

    constructor(private mcu: RP2040, private baseAddress = UART0_BASE) {
        mcu.readHooks.set(baseAddress + UARTFR, () => 0);  // intercept read address and return 0
        mcu.writeHooks.set(baseAddress + UARTDR, (address, value) => {
            this.onByte?.(value & 0xff);
        });
    }
}