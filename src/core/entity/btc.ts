import { TxComposer, mvc } from 'meta-contract'
import {
  fetchUser,
  fetchBuzzes,
  fetchRootCandidate,
  fetchRoot,
  fetchUtxos,
  notify,
  type User,
  fetchTxid,
  fetchOneBuzz,
} from '@/service/mvc.js'
import { connected } from '@/decorators/connected.js'
import { buildRootOpreturn, buildOpreturn, buildUserOpreturn } from '@/utils/opreturn-builder.js'
import { Connector } from '../connector.js'
import { errors } from '@/data/errors.js'
import { UTXO_DUST } from '@/data/constants.js'
import { checkBalance, sleep } from '@/utils/index.js'
import { type Transaction } from '@/wallets/wallet.js'
import type { Encryption, Operation } from '@/utils/dataoutput-builder.js'
import * as bitcoin from 'bitcoinjs-lib'

type Root = {
  id: string
  nodeName: string
  address: string
  txid: string
  publicKey: string
  parentTxid: string
  parentPublicKey: string
  version: string
  createdAt: number
}

export class Entity {
  public connector: Connector | undefined
  private _name: string
  private _schema: any
  private _root: Root
  public userInfo: User
  constructor(name: string, schema: any) {
    this._name = name
    this._schema = schema
    //this.connector.entity = this;
  }
  get blockchain() {
    return this.connector.blockchain
  }

  get name() {
    return this._name
  }

  get schema() {
    return this._schema
  }

  public isConnected() {
    return this.connector?.isConnected() ?? false
  }

  public disconnect() {
    this.connector?.disconnect()
  }

  get address() {
    return this.connector?.address
  }

  get metaid() {
    return this.connector?.metaid
  }

  get root() {
    return this._root
  }

  @connected
  public hasRoot() {
    return true
  }

  @connected
  public async getRoot(): Promise<Partial<Root>> {
    if (this._root) return this._root

    const root = await fetchRoot({
      metaid: this.metaid,
      nodeName: this.schema.nodeName,
      nodeId: this.schema.versions[0].id,
    })
    this._root = root

    if (!this._root) {
      const user = await fetchUser(this.metaid)

      if (user.metaid) {
        const protocolAddress = await this.connector.getAddress('/0/2')
        const rootCandidate = await fetchRootCandidate({
          xpub: this.connector.xpub,
          parentTxId: user.protocolTxid,
        })

        const { txid } = await this.createRoot({
          protocolAddress,
          protocolTxid: user.protocolTxid,

          candidatePublicKey: rootCandidate.publicKey,
        })

        await sleep(1000)

        // re fetch
        const root = await fetchRoot({
          metaid: this.metaid,
          nodeName: this.schema.nodeName,
          nodeId: this.schema.versions[0].id,
        })
        if (!root) throw new Error(errors.FAILED_TO_CREATE_ROOT)

        this._root = root
      }
    }

    return this._root
  }

  @connected
  private async createRoot({
    protocolAddress,
    protocolTxid,
    candidatePublicKey,
  }: {
    protocolAddress: string
    protocolTxid: string
    candidatePublicKey: string
  }) {
    const walletAddress = mvc.Address.fromString(this.connector.address, 'mainnet' as any)
    const transactions: Transaction[] = [] // apply pay

    let dustTxid = ''
    let dustValue = 0
    // 1.1 first, check if protocol address already has dust utxos;
    // if so, use it directly;
    const dusts = await fetchUtxos({ address: protocolAddress })
    if (dusts.length > 0) {
      dustTxid = dusts[0].txid
      dustValue = dusts[0].value
    } else {
      // 1.2 otherwise, send dust to root address
      if (!(await checkBalance(this.connector.address))) {
        throw new Error(errors.NOT_ENOUGH_BALANCE)
      }
      // apply pay
      const dustTxComposer = new TxComposer()
      dustTxComposer.appendP2PKHOutput({
        address: new mvc.Address(protocolAddress, 'mainnet' as any),
        satoshis: UTXO_DUST,
      })
      transactions.push({
        txComposer: dustTxComposer,
        message: 'Create link dust utxo',
      })
      // apply pay

      // const { txid } = await this.connector.send(protocolAddress, UTXO_DUST)
      dustTxid = dustTxComposer.getTxId()
      dustValue = UTXO_DUST
    }

    // 2. link tx
    let linkTxComposer = new TxComposer()
    linkTxComposer.appendP2PKHInput({
      address: mvc.Address.fromString(protocolAddress, 'mainnet' as any),
      txId: dustTxid,
      outputIndex: 0,
      satoshis: dustValue,
    })

    const metaidOpreturn = buildRootOpreturn({
      publicKey: candidatePublicKey,
      parentTxid: protocolTxid,
      schema: this.schema,
      body: undefined,
    })
    console.log('metaidOpreturn', metaidOpreturn)
    linkTxComposer.appendOpReturnOutput(metaidOpreturn)

    transactions.push({
      txComposer: linkTxComposer,
      message: 'Create Root',
    })

    /////////////
    // const biggestUtxo = await fetchBiggestUtxo({
    //   address: walletAddress.toString(),
    // })
    // linkTxComposer.appendP2PKHInput({
    //   address: walletAddress,
    //   txId: biggestUtxo.txid,
    //   outputIndex: biggestUtxo.outIndex,
    //   satoshis: biggestUtxo.value,
    // })

    // const tx = linkTxComposer.getTx()

    // linkTxComposer.appendChangeOutput(walletAddress, 1)

    // // save input-1's output for later use
    // const input1Output = linkTxComposer.getInput(1).output

    // linkTxComposer = await this.connector.signInput({
    //   txComposer: linkTxComposer,
    //   inputIndex: 0,
    // })

    // // reassign input-1's output
    // linkTxComposer.getInput(1).output = input1Output
    // linkTxComposer = await this.connector.signInput({
    //   txComposer: linkTxComposer,
    //   inputIndex: 1,
    // })
    // const { txid } = await this.connector.broadcast(linkTxComposer)

    // await notify({ txHex: linkTxComposer.getRawHex() })

    ///// apply pay
    const payRes = await this.connector.pay({
      transactions,
    })
    // for (const txComposer of payRes) {
    //   await this.connector.broadcast(txComposer)
    // }
    await this.connector.batchBroadcast(payRes)
    await notify({ txHex: payRes[payRes.length - 1].getRawHex() })

    return {
      txid: payRes[payRes.length - 1].getTxId(),
    }
  }

  @connected
  async createMetaidRoot(
    parent: Partial<{
      address: string
      publicKey: string
      txid: string
      body: string
    }>,
    nodeName: string
  ) {
    const walletAddress = mvc.Address.fromString(this.connector.address, 'mainnet' as any)
    const transactions: Transaction[] = []

    // 1. send dust to root address

    let dustTxid = ''
    let dustValue = 0
    if (parent?.address) {
      // 1.1 first, check if root address already has dust utxos;
      // if so, use it directly;
      const dusts = await fetchUtxos({ address: parent.address })
      if (dusts.length > 0) {
        dustTxid = dusts[0].txid
        dustValue = dusts[0].value
      } else {
        // 1.2 otherwise, send dust to root address
        if (!(await checkBalance(this.connector.address))) {
          throw new Error(errors.NOT_ENOUGH_BALANCE)
        }
        const dustTxComposer = new TxComposer()
        dustTxComposer.appendP2PKHOutput({
          address: new mvc.Address(parent.address, 'mainnet' as any),
          satoshis: UTXO_DUST,
        })
        transactions.push({
          txComposer: dustTxComposer,
          message: 'Create link dust utxo',
        })

        const { txid } = await this.connector.send(parent.address, UTXO_DUST)
        dustTxid = dustTxComposer.getTxId()
        dustValue = UTXO_DUST
      }

      // const { txid } = await this.connector.send(parent.address, UTXO_DUST)
    }

    // 2. link tx
    let linkTxComposer = new TxComposer()
    if (dustTxid) {
      linkTxComposer.appendP2PKHInput({
        address: mvc.Address.fromString(parent.address, 'mainnet' as any),
        txId: dustTxid,
        outputIndex: 0,
        satoshis: dustValue,
      })
    }

    const metaidOpreturn = buildUserOpreturn({
      publicKey: parent.publicKey,
      parentTxid: parent?.txid,
      protocolName: nodeName,
      body: parent.body ? parent.body : 'NULL',
    })
    linkTxComposer.appendOpReturnOutput(metaidOpreturn)

    transactions.push({
      txComposer: linkTxComposer,
      message: `Create Root Metaid with ${nodeName}`,
    })

    // const biggestUtxo = await fetchBiggestUtxo({ address: walletAddress.toString() })
    // linkTxComposer.appendP2PKHInput({
    //   address: walletAddress,
    //   txId: biggestUtxo.txid,
    //   outputIndex: biggestUtxo.outIndex,
    //   satoshis: biggestUtxo.value,
    // })
    // linkTxComposer.appendChangeOutput(walletAddress, 1)

    // let input1Output: any
    // if (parent?.address) {
    //   // save input-1's output for later use
    //   input1Output = linkTxComposer.getInput(1).output
    // }

    // linkTxComposer = await this.connector.signInput({
    //   txComposer: linkTxComposer,
    //   inputIndex: 0,
    //   // path: parent.path, //"/0/0",
    // })
    // if (parent?.address) {
    //   linkTxComposer.getInput(1).output = input1Output
    //   linkTxComposer = await this.connector.signInput({
    //     txComposer: linkTxComposer,
    //     inputIndex: 1,
    //     // path: "/0/0",
    //   })
    // }

    // const { txid } = await this.connector.broadcast(linkTxComposer)
    // console.log('txid', txid)
    // await notify({ txHex: linkTxComposer.getRawHex() })

    // return { txid }
    ///// apply pay

    // const payRes = await this.connector.pay({
    //   transactions,
    // })

    // await this.connector.batchBroadcast(payRes)
    // await notify({ txHex: payRes[payRes.length - 1].getRawHex() })

    // return {
    //   txid: payRes[payRes.length - 1].getTxId(),
    // }

    return transactions
  }

  @connected
  public async createV2(
    body: unknown,
    options?: {
      operation: Operation
      path: string
      encryption: Encryption
      signMessage: string
      dataType?: string
      encoding?: string
      serialAction?: 'combo' | 'finish'
      transactions?: Transaction[]
    }
  ) {
    const transactions: Transaction[] = options?.transactions ?? []
    // txcomposer ==> PSBT
    /**
     * 1. build two transactions in sequence:
     *  1.1 commit tx for building data-output(opfalse),
     *      its value set to 10546 satoshi temporarily
     *  1.2 reveal tx for writing data onchain,
     *      its output value set to 546 satoshi
     * 2. link last two tx: 1.1 tx as 1.2 tx's input
     */

    if (!(await checkBalance(this.connector.address))) {
      throw new Error(errors.NOT_ENOUGH_BALANCE)
    }
    // construct dataoutput
    const dataOutput = { body: 'Hello World', operation: 'create' }
    const leafScriptAsm = JSON.stringify(dataOutput)
    const leafScript = bitcoin.script.fromASM(leafScriptAsm)

    const scriptTree = {
      output: leafScript,
    }

    const { output, address, hash } = bitcoin.payments.p2tr({
      internalPubkey: toXOnly(internalKey.publicKey),
      scriptTree,
      network: regtest,
    })

    //// commitTxComposer
    const commitTxComposer = new TxComposer()

    commitTxComposer.appendP2PKHOutput({
      address: new btc.Address(address, 'mainnet' as any),
      satoshis: 2546,
    })

    // todo: 找零逻辑

    transactions.push({
      txComposer: commitTxComposer,
      message: 'Create Commit dust utxo',
    })

    const commitTxid = commitTxComposer.getTxId()
    const commitValue = 2546

    const metaidDataOutput = []
    commitTxComposer.appendDataoutput(metaidDataOutput)

    ///// revealTxComposer
    const revealTxComposer = new TxComposer()

    revealTxComposer.appendP2PKHInput({
      address: new btc.Address(address, 'mainnet' as any),
      txId: commitTxid,
      outputIndex: 0,
      satoshis: commitValue,
    })
    revealTxComposer.appendP2PKHOutput({
      address: new btc.Address(address, 'mainnet' as any),
      satoshis: 546,
    })
  }

  public async list(page: number) {
    if (this.name !== 'buzz') throw new Error(errors.NOT_SUPPORTED)

    const items = await fetchBuzzes({ metaid: this.metaid, page })

    return {
      items,
      limit: 50,
    }
  }
  public async one(txid: string) {
    if (this.name !== 'buzz') throw new Error(errors.NOT_SUPPORTED)

    const buzz = await fetchOneBuzz(txid)

    return buzz
  }
}
