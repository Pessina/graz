import type { AbstraxionAuth } from "@burnt-labs/abstraxion-core";
import { fromBech32 } from "@cosmjs/encoding";
import type { DirectSignResponse } from "@cosmjs/proto-signing";
import type { Keplr, OfflineDirectSigner, SignDoc } from "@keplr-wallet/types";
import Long from "long";

import { RECONNECT_SESSION_KEY } from "../../constant";
import { useGrazInternalStore, useGrazSessionStore } from "../../store";
import type { SignDirectParams, Wallet } from "../../types/wallet";
import { WalletType } from "../../types/wallet";

export const getXion = (): Wallet => {
  const init = async () => {
    const { AbstraxionAuth } = await import("@burnt-labs/abstraxion-core");
    const client = new AbstraxionAuth();
    // Configure the client with necessary parameters
    client.configureAbstraxionInstance("https://rpc.xion.io");
    useGrazSessionStore.setState({ xionClient: client });
    return client;
  };

  const enable = async (_chainId: string | string[]) => {
    let client = useGrazSessionStore.getState().xionClient;
    if (!client) {
      client = await init();
    }
    await client.login();
  };

  const onAfterLoginSuccessful = async () => {
    const client = useGrazSessionStore.getState().xionClient;
    if (!client) throw new Error("Xion client is not initialized");

    const accounts = await client.abstractAccount?.getAccounts();
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found");
    }
    const account = accounts[0];

    useGrazSessionStore.setState((prev) => ({
      accounts: {
        ...(prev.accounts || {}),
        [account.address]: {
          address: fromBech32(account.address).data,
          bech32Address: account.address,
          algo: account.algo,
          name: "", // Add a name if available
          pubKey: account.pubkey,
          isKeystone: false,
          isNanoLedger: false,
        },
      },
    }));

    useGrazInternalStore.setState({
      walletType: WalletType.XION,
      _reconnect: false,
      _reconnectConnector: WalletType.XION,
    });
    useGrazSessionStore.setState({
      status: "connected",
    });
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(RECONNECT_SESSION_KEY, "Active");
    }
  };

  const getKey = async () => {
    const client = useGrazSessionStore.getState().xionClient;
    if (!client) throw new Error("Xion client is not initialized");
    const accounts = await client.abstractAccount?.getAccounts();
    if (!accounts || accounts.length === 0) {
      throw new Error("No accounts found");
    }
    const account = accounts[0];

    if (!account) throw new Error("No accounts found");

    return {
      address: fromBech32(account.address).data,
      bech32Address: account.address,
      algo: account.algo,
      name: "",
      pubKey: account.pubkey,
      isKeystone: false,
      isNanoLedger: false,
    };
  };

  const createOfflineSigner = (client?: AbstraxionAuth): OfflineDirectSigner => {
    if (!client) throw new Error("Xion client is not initialized");
    if (!client.abstractAccount) throw new Error("Abstract account is not initialized");

    return {
      getAccounts: () => {
        if (!client.abstractAccount) throw new Error("Abstract account is not initialized");
        return client.abstractAccount.getAccounts();
      },
      signDirect: async (signerAddress: string, signDoc: SignDoc): Promise<DirectSignResponse> => {
        if (!client.abstractAccount) throw new Error("Abstract account is not initialized");

        const signResult = await client.abstractAccount.signDirect(signerAddress, {
          bodyBytes: signDoc.bodyBytes,
          authInfoBytes: signDoc.authInfoBytes,
          chainId: signDoc.chainId,
          accountNumber: BigInt(signDoc.accountNumber.toString()),
        });

        return {
          signed: {
            ...signResult.signed,
            accountNumber: Long.fromString(signResult.signed.accountNumber.toString()),
          },
          signature: signResult.signature,
        };
      },
    };
  };

  const getOfflineSignerDirect = () => {
    const client = useGrazSessionStore.getState().xionClient;
    return createOfflineSigner(client);
  };

  // eslint-disable-next-line @typescript-eslint/require-await
  const getOfflineSignerAuto = async () => {
    const client = useGrazSessionStore.getState().xionClient;
    return createOfflineSigner(client);
  };

  const getOfflineSigner = () => {
    const client = useGrazSessionStore.getState().xionClient;
    return createOfflineSigner(client);
  };

  const signDirect = async (...args: SignDirectParams): Promise<DirectSignResponse> => {
    const offlineSigner = getOfflineSignerDirect();
    const [_chainId, signerAddress, signDoc] = args;
    return offlineSigner.signDirect(signerAddress, {
      bodyBytes: signDoc.bodyBytes ?? new Uint8Array(),
      authInfoBytes: signDoc.authInfoBytes ?? new Uint8Array(),
      chainId: signDoc.chainId ?? "",
      accountNumber: signDoc.accountNumber ?? Long.fromNumber(0),
    });
  };

  const experimentalSuggestChain = async (..._args: Parameters<Keplr["experimentalSuggestChain"]>) => {
    await Promise.reject(new Error("Xion does not support experimentalSuggestChain"));
  };

  return {
    init,
    enable,
    onAfterLoginSuccessful,
    getKey,
    signDirect,
    experimentalSuggestChain,
    getOfflineSignerAuto,
    // @ts-expect-error - CapsuleAminoSigner | OfflineDirectSigner
    getOfflineSigner,
    getOfflineSignerOnlyAmino,
    signAmino,
  };
};
