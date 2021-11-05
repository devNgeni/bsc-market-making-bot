import { readFileSync } from "fs";
import { ethers } from "ethers";
import WebSocket from "ws";
import { NextNotification, Result } from "./../types";
import { priceImpact } from "./../price-impact";
import { config } from "./../config";

class MemoPoolWrapper {
  private _ws!: WebSocket;

  /// getters
  get ws() {
    if (this._ws) {
      throw Error("Your websocket listener is not setup");
    }
    return this._ws;
  }

  get pancakeSwapAbi() {
    return new ethers.utils.Interface(
      readFileSync(`${__dirname}/../abis/pancakeswap.json`, "utf8")
    );
  }
  ///setters

  connect(url: string) {
    return new Promise((resolve, reject) => {
      try {
        this._ws = new WebSocket(url, {
          cert: readFileSync(
            `${__dirname}/../config/keys/bloxroute/external_gateway_cert.pem`
          ),
          key: readFileSync(
            `${__dirname}/../config/keys/bloxroute/external_gateway_key.pem`
          ),
          rejectUnauthorized: false,
        });
        // call on connection opened
        this.onConnectionOpen(this._ws);
        // on message get stream data
        resolve(this.getStreamDataOnMessage(this._ws));
      } catch (error: any) {
        console.log("ERROR", error.message);
      }
    });
  }

  getStreamDataOnMessage(ws: WebSocket) {
    ws.on("message", async (notification: any) => {
      try {
        const realTimeData: NextNotification = await JSON.parse(notification);
        let result = realTimeData.params?.result;
        if (result && result.txContents.input !== "0x") {
          // process the stream results

          // process stream data
          this.processStreamedData(result);
        }

        return notification;
      } catch (error) {
        // console.log(error);
      }
    });
  }

  //  Process Streaming Data
  async processStreamedData(result: Result) {
    const toRouterAddress = result.txContents.to;
    const gasPrice = parseInt(result.txContents.gasPrice, 16); // Gas price
    let gas = parseInt(result.txContents.gas, 16); // gas fees
    const value = parseInt(result.txContents.value, 16); // eth amount on this transction
    let nonce = parseInt(result.txContents.nonce, 16); // Nonce of a transction

    // decodedTransaction data
    const decodedTransaction = this.pancakeSwapAbi.parseTransaction({
      data: result.txContents.input,
    });

    // console.log(decodedTransaction.args);
    // token under trade
    const token = decodedTransaction.args[1][1];

    // CHECK if the ROUTER Version is used

    if (toRouterAddress === config.BSC.PANCAKE_V2_ROUTE) {
      const impact = await priceImpact.getPriceImpact(token, value);

      console.table(impact);
    }
  }

  /**
   *
   * @param ws Websocket
   * @returns On Connection
   */

  onConnectionOpen(ws: WebSocket) {
    return ws.on("open", () => {
      /**
       * SwapExactETHForToke Methods:  7ff36ab5,fb3bdb41,
       * Add liquidity Methods "f305d719 e8e33700"
       * SwapExactTokenForETH Methods: 791ac947, 18cbafe5, 4a25d94a
       */
      ws.send(
        `
            {
              "jsonrpc": "2.0",
              "id": 1,
              "method": "subscribe",
              "params": [
                "pendingTxs",
                {
                  "duplicates": false,
                  "include": [
                    "tx_hash",
                    "tx_contents.from",
                    "tx_contents.to",
                    "tx_contents.value",
                    "tx_contents.gas_price",
                    "tx_contents.gas",
                    "tx_contents.input",
                    "tx_contents.nonce"
                  ],
                  "filters": "method_id in [7ff36ab5, fb3bdb41, 791ac947, 18cbafe5, 4a25d94a ]"
                }
              ],
              "blockchain_network": "BSC-Mainnet"
            }
            `
      );
    });
  }
}

export const memoPoolWrapper = new MemoPoolWrapper();