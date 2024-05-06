export interface WalletStatic {
  create: ((mnemonic: string, derivePath?: string) => Promise<MetaIDWalletForBtc>) | (() => Promise<MetaIDWalletForBtc>)
  restore: ({ address, pub }: { address: string; pub: string }) => MetaIDWalletForBtc
}

export type MetaIDWalletForBtc = {
  address: string
  pub: string
  // network: Network
  hasAddress(): boolean

  getAddress({ path }: { path?: string }): Promise<string>
  getPublicKey(path?: string): Promise<string>
  getBalance(): Promise<{ address: string; confirmed: number; unconfirmed: number }>
  // signMessage(message: string, encoding?: 'utf-8' | 'base64' | 'hex' | 'utf8'): Promise<string>
  // signPsbt(psbtHex: string, options?: any): Promise<string>
  // broadcast(txComposer: TxComposer | TxComposer[]): Promise<{ txid: string } | { txid: string }[]>
  // batchBroadcast(txComposer: TxComposer[]): Promise<{ txid: string }[]>
  inscribe({ data, options }: { data: any; options?: { noBroadcast: boolean } }): Promise<any>
  // encrypt(message: string, publicKey: string): Promise<string>;
}
