const algosdk = require('algosdk');
const crypto = require('crypto');
const fs = require('fs');

const mnemonic = "sample wheat again solid south divide uniform very athlete birth avocado silly coil fabric beauty allow scout symbol please wine current cupboard push able panel"

async function fundAccount(dispenser, accountToBeFunded, algodClient) {
    try{
        let params = await algodClient.getTransactionParams().do();
        let amount = 1000000;
        let sender = dispenser.addr;
        let txn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: sender, 
            to: accountToBeFunded.addr, 
            amount: amount, 
            note: new Uint8Array(), 
            suggestedParams: params
        });

        let signedTxn = txn.signTxn(dispenser.sk);
        let txId = txn.txID().toString();

        // Submit the transaction
        await algodClient.sendRawTransaction(signedTxn).do();

        // Wait for confirmation
        let confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
        accountInfo = await algodClient.accountInformation(accountToBeFunded.addr).do();
        }
        catch (err) {
            console.log("err", err);
        }
}

const createAccount =  function (){
    try{  
        const myaccount = algosdk.generateAccount();
        return myaccount;
    }
    catch (err) {
        console.log("err", err);
    }
};

async function createSimpleToken(algodClient, alice) {
    console.log("");
    console.log("==> CREATE ASSET");
    const params = await algodClient.getTransactionParams().do();

    const defaultFrozen = false;
    // Used to display asset units to user    
    const unitName = "STK";
    // Friendly name of the asset    
    const assetName = "SimpleToken@arc3";

    const metadataJSON = {
             "name": "SimpleToken",
             "description": "Simple tokens",
             "properties": {
                 "simple_property": "Simple tokens",
                 "rich_property": {
                     "name": "SimpleToken",
                     "value": "001",
                     "display_value": "001",
                     "class": "emphasis",
                     "css": {
                         "color": "#ffffff",
                         "font-weight": "bold",
                         "text-decoration": "underline"
                     }
                 },
                 "array_property": {
                     "name": "Simple Tokens",
                     "value": [1, 2, 3, 4],
                     "class": "emphasis"
                 }
             }
    };

    const managerAddr = alice.addr;
    const reserveAddr = undefined;
    const freezeAddr = undefined;
    const clawbackAddr = undefined;

    const decimals = 0;
    const total = 300;


    const txn = algosdk.makeAssetCreateTxnWithSuggestedParamsFromObject({
        from: alice.addr,
        total, 
        decimals,
        assetName,
        unitName,
        assetURL: "",
        assetMetadataHash: "",
        defaultFrozen,
        freeze: freezeAddr,
        manager: managerAddr,
        clawback: clawbackAddr,
        reserve: reserveAddr,
        suggestedParams: params,});

    const rawSignedTxn = txn.signTxn(alice.sk);
    const tx = (await algodClient.sendRawTransaction(rawSignedTxn).do());
    let assetID = null;
    // wait for transaction to be confirmed
    const ptx = await algosdk.waitForConfirmation(algodClient, tx.txId, 4);
    console.log("Transaction " + tx.txId + " confirmed in round " + ptx["confirmed-round"]);
    //Get the completed Transaction
    assetID = ptx["asset-index"];
    console.log("AssetID = " + assetID);

    return assetID;

}

const printAssetHolding = async function (algodClient, account, assetid) {
    let accountInfo = await algodClient.accountInformation(account).do();
    for (idx = 0; idx < accountInfo['assets'].length; idx++) {
        let scrutinizedAsset = accountInfo['assets'][idx];
        if (scrutinizedAsset['asset-id'] == assetid) {
            let myassetholding = JSON.stringify(scrutinizedAsset, undefined, 2);
            console.log("assetholdinginfo = " + myassetholding);
            break;
        }
    } if (accountInfo['assets'].length == 0) {
        console.log("No asset %d available for the account %s", assetid, account)
    }
};

async function transferTokens(algodClient, fromAccount, toAccount, assetID, amount) {
    params = await algodClient.getTransactionParams().do();
    let sender = fromAccount.addr;
    let receiver = toAccount.addr;

    let revocationTarget = undefined;
    let closeRemainderTo = undefined;

    amount = amount;

    note = new Uint8Array();

    let opttxn = algosdk.makeAssetTransferTxnWithSuggestedParams(
        sender, 
        receiver, 
        closeRemainderTo, 
        revocationTarget,
        amount, 
        note, 
        assetID, 
        params);
    
    // Must be signed by the account wishing to opt in to the asset    
    rawSignedTxn = opttxn.signTxn(fromAccount.sk);
    let opttx = (await algodClient.sendRawTransaction(rawSignedTxn).do());
    // Wait for confirmation
    confirmedTxn = await algosdk.waitForConfirmation(algodClient, opttx.txId, 4);
    //Get the completed Transaction
    console.log("Transaction " + opttx.txId + " confirmed in round " + confirmedTxn["confirmed-round"]);

}

async function run() {
    let alice = createAccount();
    let dispenser = algosdk.mnemonicToSecretKey(mnemonic);
    let bob = createAccount();
    const algodToken = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const algodServer = 'http://localhost';
    const algodPort = 4001;

    let algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);
    await fundAccount(dispenser, alice, algodClient);
    await fundAccount(dispenser, bob, algodClient);
    // verify that alice's account is not empty
    let accountInfo = await algodClient.accountInformation(alice.addr).do();
    let startingAmount = accountInfo.amount;
    console.log("Alice's account %s have: %d microAlgos", alice.addr, startingAmount);

    // verify that alice's account is not empty
    accountInfo = await algodClient.accountInformation(bob.addr).do();
    startingAmount = accountInfo.amount;
    console.log("Bob's account %s have: %d microAlgos", bob.addr, startingAmount);

    let assetID = await createSimpleToken(algodClient, alice);
    // verify that alice's account has 300 SimpleTokens (STKs)
    await printAssetHolding(algodClient, alice.addr, assetID);

    // bob needs to opt-in to be able to receive asset STK
    await transferTokens(algodClient, bob, bob, assetID, 0);

    // verify that bob's account has 0 SimpleTokens (STKs)
    await printAssetHolding(algodClient, bob.addr, assetID);

    console.log("Sending 50 tokens to Bob...");

    // now we transfer 50 tokens from alice to bob
    await transferTokens(algodClient, alice, bob, assetID, 50);

    console.log("Alice's account balance after transfer");
    await printAssetHolding(algodClient, alice.addr, assetID);

    console.log("Bob's account balance after transfer");
    await printAssetHolding(algodClient, bob.addr, assetID);
    
}

run();