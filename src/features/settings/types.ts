export interface PrintSettings {
  printerId: string;
  paperSize: string;
  paperWeight: string;
  tray: string;
  duplex: string;
  copies: number;
  colorMode: string;
  quality: string;
  driverOptions?: Record<string, string>;
}
