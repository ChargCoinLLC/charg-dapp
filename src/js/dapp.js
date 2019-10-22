class DApp {

    constructor(config, options) {

        this.chargAbi = require("../abi/ChargCoins.json");
        this.serviceAbi = require("../abi/ChargService.json");
        this.web3js = null;

        this.useLightWallet = false;
        this.defaultAccount = null;
        this.timeConvert = 3600; //from seconds to hours
        this.currency = "CHG";
    
        this.config = config;
        this.options = options;

        this.gasPrice = config.gasPrice;
        this.gasLimit = config.gasLimit;
    
        this.swapCoins = [];
        this.services = [];
        this.nodeServices = [];

        this.blockNumber = false;
        this.subscriptions = {};
    
        this.events = [];

        this.registeredNodes = [];
        this.sellOrders = [];
        this.buyOrders = [];

        this.initWeb3();
    };
    
    //events
    on(event, callback) {
        this.events[event] = callback;
    } 

    // init web3 : injected app, legacy dapp browser or local lightwallet 
    initWeb3() {
        // Try Metamask, Nifty etc..
        if (window.ethereum) {
            this.web3js = new Web3(ethereum);
            try {
                ethereum.enable();
            } catch (error) {
                // User denied account access...
                console.log('Web3 Browser error', error);
            }
            this.onWeb3();
        }
        // Legacy dapp browsers...
        else if (window.web3) {
            this.web3js = new Web3(window.web3.currentProvider);
            this.onWeb3();
        }
        else {
            // Non-dapp browsers...
            console.log('Non-Ethereum browser detected.');
            if (this.web3js && this.web3js.eth && this.web3js.eth.accounts.length) {
                console.log('Web3 unlocked already');
                return;
            }
            var ref = window.document.getElementsByTagName( 'script' )[ 0 ];
            var script = window.document.createElement( 'script' );
            script.src = '/lib/web3.js';
            script.onload = () => {
                
                this.web3js = new Web3(new Web3.providers.HttpProvider(this.config.web3HttpProvider));
                this.onWeb3();
                
                //let's load light wallet
                var ref = window.document.getElementsByTagName( 'script' )[ 0 ];
                var script = window.document.createElement( 'script' );
                script.src = '/lib/lightwallet.min.js';
                script.onload = () => {
                    this.lightWalletLoaded = true;
                    this.initLightWallet();
                };
                ref.parentNode.insertBefore( script, ref );

                var script = window.document.createElement( 'script' );
                script.src = '/lib/hooked-web3-provider.min.js';
                script.onload = () => {
                    this.hookedWeb3ProviderLoaded = true;
                    this.initLightWallet();
                };
                ref.parentNode.insertBefore( script, ref );
            };
            ref.parentNode.insertBefore( script, ref );
        }
    }

    // init web3 via socket in order to read events
    initWeb3Socket() {

        this.web3Socket = new WebSocket(this.config.web3WsProvider);

        this.web3Socket.onopen = () => {

            this.web3SocketSubscribed = false;
            this.web3Socket.send( '{"jsonrpc":"2.0", "id": 1, "method": "eth_subscribe", "params": ["newHeads"]}' );

            if (this.blockNumber) {  // do not subscribe without blockNumber
                this.web3Socket.send( '{"jsonrpc":"2.0", "id": 2, "method": "eth_subscribe", "params": ["logs", { "fromBlock": "0x1", "toBlock": "latest", \
                    "address": "'+this.config.serviceContractAddress+'"}]}' );
                this.web3Socket.send( '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{ "fromBlock": "0x0", "toBlock": "latest", \
                    "address": "'+this.config.serviceContractAddress+'"}], "id": 3 }' );
                this.web3SocketSubscribed = true;
            }

            this.web3Socket.onclose = () => {
                console.log("Web3 socket connection closed");
                delete this.web3Socket;
                this.web3Socket = new WebSocket(this.config.web3WsProvider);
            };
        
            //this.web3Socket.on('error', err => { console.log(err) })
                
            this.web3Socket.onmessage = (event) => {
                if (typeof(event.data) == 'string') {
                    try {
                        var data = JSON.parse(event.data);
                        if (data.id == 1) {
                            this.subscriptions['newHeads'] = data.result;
                        } else if (data.id == 2) {
                            this.subscriptions['serviceContractLogs'] = data.result;
                        } else if (data.id == 3) {
                            for (var i=0; i<data.result.length; i++) {
                                this.dispatchEvent(data.result[i]);
                            }
                            if (typeof this.events['updateOrders'] == 'function') {
                                this.events['updateOrders'](this.sellOrders, this.buyOrders);
                            }
                            if (typeof this.events['registeredNodes'] == 'function') {
                                this.events['registeredNodes'](this.registeredNodes);
                            }
                    } else {
                            if (data.params.subscription==this.subscriptions['newHeads']) {
                                var currentBlockNumber = parseInt(data.params.result.number,16);
                                this.blockNumber = currentBlockNumber;
                                if (!this.web3SocketSubscribed) {
                                    // new logs
                                    this.web3Socket.send( '{"jsonrpc":"2.0", "id": 2, "method": "eth_subscribe", "params": ["logs", { "fromBlock": "0x1", "toBlock": "latest", \
                                        "address": "'+this.config.serviceContractAddress+'"}]}' );
                                    // all logs
                                    this.web3Socket.send( '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{ "fromBlock": "0x0", "toBlock": "latest", \
                                        "address": "'+this.config.serviceContractAddress+'"}], "id": 3 }' );
                                }
                                if (typeof this.events['newBlock'] == 'function') {
                                    this.events['newBlock'](this.blockNumber);
                                }
                            } else if (data.params.subscription==this.subscriptions['serviceContractLogs']) {
                                this.dispatchEvent(data.params.result);
                                this.updateAccounts();
                                if (typeof this.events['updateOrders'] == 'function') {
                                    this.events['updateOrders'](this.sellOrders, this.buyOrders);
                                }
                                if (typeof this.events['registeredNodes'] == 'function') {
                                    this.events['registeredNodes'](this.registeredNodes);
                                }
                            }else{
                                //console.log(data);
                            }
                        }
                    } catch (e) {
                        console.log(e);
                    }
                };
            };
        };            
    };            


    // load smart contracts and account data from blockchain
    onWeb3() {
        if (this.web3js.eth) {

            this.chargContract = this.web3js.eth.contract(this.chargAbi).at(this.config.chargContractAddress);
            this.serviceContract = this.web3js.eth.contract(this.serviceAbi).at(this.config.serviceContractAddress);

            this.web3js.eth.getBlockNumber((e, r) => {
                this.blockNumber = r;
                if (typeof this.events['newBlock'] == 'function') {
                    this.events['newBlock'](this.blockNumber);
                }
                this.updateAccounts();
            });

            this.initWeb3Socket();

            switch (this.web3js.version.network) {
                case '1':
                    this.ethNetwork = 'Mainnet';
                    break;
                case '2':
                    this.ethNetwork = 'Morden Test Network';
                    break;
                case '3':
                    this.ethNetwork = 'Ropsten Test Network';
                    break;
                case '4':
                    this.ethNetwork = 'Rinkeby Test Network';
                    break;
                case '42':
                    this.ethNetwork = 'Kovan Test Network';
                    break;
                default:
                    this.ethNetwork = 'Custom Network';
            }

            if (this.web3js.version.network !== this.config.web3Network) {
                // ask user to switch to desired network
                console.log('Please switch to desired network.');
            }

            this.serviceContract.swapCoinsCount((err, swapCoinsCount) => {
                if (err) throw new Error('swapCoinsCount');
                for (var coinIdx=0; coinIdx<swapCoinsCount; coinIdx++) {
                    this.serviceContract.swapCoins(coinIdx, (err, swapCoin) => {
                        if (err) throw new Error('swapCoins');
                        var sc = {
                            enabled: swapCoin[0],
                            fee: swapCoin[1].toFixed(3),
                            coin: swapCoin[2]
                        };
                        this.swapCoins.push(sc);
                        if (typeof this.events['newSwapCoin'] == 'function') {
                            this.events['newSwapCoin'](sc);
                        }
                    });
                }
            });

            this.serviceContract.servicesCount((err, servicesCount) => {
                if (err) throw new Error('servicesCount');
                for (var serviceIdx=0; serviceIdx<servicesCount; serviceIdx++) {
                    var sid = serviceIdx;
                    this.serviceContract.services(sid, (err, service) => {
                        if (err) throw new Error('services');
                        this.services.push(service)
                        if (typeof this.events['newService'] == 'function') {
                            this.events['newService'](service);
                        }
                    });

                    if (this.options.nodeAddress !== undefined) {
                        this.serviceContract.nodeService(this.options.nodeAddress, sid, (err, nodeData) => {
                            if (err) throw new Error('nodeService');
                            this.nodeServices.push(nodeData)
                            if (typeof this.events['newNodeService'] == 'function') {
                                this.events['newNodeService'](err, nodeData);
                            }
                        });
                    }
                }
            });

            if (this.options.nodeAddress !== undefined) {
                // is node registered ?
                this.serviceContract.registeredNodes(this.options.nodeAddress, (err, registeredNode) => {
                    if (typeof this.events['registeredNode'] == 'function') {
                        this.events['registeredNode'](err, registeredNode);
                    }
                });
            }

        }
    } // onWeb3

    // set hooked web3 provider for the lightwallet account
    setHookedWeb3Provider(keystore) {
        try {
            var web3Provider = new HookedWeb3Provider({
                host: this.config.web3HttpProvider,
                transaction_signer: keystore
            });
            this.web3js.setProvider(web3Provider);
        } catch (e) {
            console.log("HookedWeb3Provider error ", e);
        }
    }

    // try to load lightwallet
    initLightWallet() {
        if (this.hookedWeb3ProviderLoaded && this.lightWalletLoaded) {
            try {
                //localKeyStore = JSON.parse(localStorage.getItem('localKeyStore'));
                this.keystore = lightwallet.keystore.deserialize(localStorage.getItem('localKeyStore'));
                this.keystore.passwordProvider = this.options.hookedPasswordProvider;
                this.setHookedWeb3Provider(this.keystore);
                this.updateAccounts();
                this.useLightWallet = true;
                if (typeof this.events['lightWallet'] == 'function') {
                    this.events['lightWallet'](false);
                }
            } catch (e) {
                console.log('No wallet in the local store', e);
                this.secretSeed = lightwallet.keystore.generateRandomSeed();
                if (typeof this.events['lightWallet'] == 'function') {
                    this.events['lightWallet'](e, this.secretSeed);
                }
            }
        }
    }

    // create a new lightwallet account
    createLightWalletAccount(password, hookedPasswordProvider) {

        lightwallet.keystore.createVault({
            password: password,
            seedPhrase: this.secretSeed, 
            //salt: fixture.salt,     // Optionally provide a salt. A unique salt will be generated otherwise.
            hdPathString: "m/0'/0'/0'"
        },  (err, ks) => {
            if (!err) {
                this.keystore = ks;
                // Some methods will require providing the `pwDerivedKey`,
                // Allowing you to only decrypt private keys on an as-needed basis.
                // You can generate that value with this convenient method:
                this.keystore.keyFromPassword(password, (err, pwDerivedKey) => {
                    if (err) throw err;
                    // generate new address/private key pair
                    // the corresponding private keys are also encrypted
                    this.keystore.generateNewAddress(pwDerivedKey, 1);

                    localStorage.setItem('localKeyStore', this.keystore.serialize());
                    this.setHookedWeb3Provider(this.keystore);
                    
                    this.keystore.passwordProvider = this.options.hookedPasswordProvider;
                    this.useLightWallet = true;
                    this.updateAccounts();
                });
            }
        });	
    };


    // update the exchange orders table and the nodes list
    dispatchEvent(res) {
        var rate;
        
        var event = res.topics[0];
        var hash = res.topics[1];
        var sender;
    
        if (event==this.config.sellOrderEvent || event==this.config.buyOrderEvent) {
        
            var give = this.web3js.fromWei(parseInt(res.data.substr(2+0, 64),16).toString(), "ether");
            var get = this.web3js.fromWei(parseInt(res.data.substr(2+64, 64),16).toString(), "ether");
            
            var expire = parseInt(res.data.substr(2+128, 64),16);
            sender = "0x" + res.data.substr(2+192+24, 40);
    
            if (expire-this.blockNumber < 5 || give==0 || get==0) {  
                return;  // empty or expired orders are ignored
            }
    
            if (event==this.config.sellOrderEvent) {
    
                rate = (get/give).toFixed(7);
                this.sellOrders[hash] = {
                    give: give,
                    get: get,
                    rate: rate,
                    expire: expire,
                    hash: hash,
                    seller: sender
                };
                
            }else if (event==this.config.buyOrderEvent) {
                
                rate = (give/get).toFixed(7);
                this.buyOrders[hash] = {
                    give: give,
                    get: get,
                    rate: rate,
                    expire: expire,
                    hash: hash,
                    seller: sender
                };
            }
            //checkSenderBalance(sender,hash);
    
        } else if (event==this.config.sellEvent) {
    
            var give = this.web3js.fromWei(parseInt(res.data.substr(2+0, 64),16).toString(), "ether");
            var get = this.web3js.fromWei(parseInt(res.data.substr(2+64, 64),16).toString(), "ether");
            
            //checkSenderBalance(sender,hash);
    
            if (hash in this.buyOrders) {
                if (give==0 || get==0) {
                    delete this.buyOrders[hash];
                }else{	
                    this.buyOrders[hash].give = give;
                    this.buyOrders[hash].get = get;
                    //this.buyOrders[hash].rate = (give/get).toFixed(7);  //should not be changed, but ...
                };
            }
    
        } else if (event==this.config.buyEvent) {
        
            var give = this.web3js.fromWei(parseInt(res.data.substr(2+0, 64),16).toString(), "ether");
            var get = this.web3js.fromWei(parseInt(res.data.substr(2+64, 64),16).toString(), "ether");
    
            if (hash in this.sellOrders) {
                if (give==0 || get==0) {
                    delete this.sellOrders[hash];
                }else{	
                    this.sellOrders[hash].give = give;
                    this.sellOrders[hash].get = get;
                    this.sellOrders[hash].rate = (get/give).toFixed(7);  //should not be changed, but ...
                    //checkSenderBalance(hash);
                };
            }
    
        } else if (event==this.config.cancelSellEvent) {
    
            if (hash in this.sellOrders) {
                delete this.sellOrders[hash];
            }
        
        } else if (event==this.config.cancelBuyEvent) {
    
            if (hash in this.buyOrders) {
                delete this.buyOrders[hash];
            }
    
        } else if (event==this.config.serviceOnEvent) {
            // Buy event is there

        } else if (event==this.config.nodeRegisteredEvent || event==this.config.nodeModifiedEvent ) {

            var node = "0x" + res.topics[1].substr(2+24, 40);
            var latitude = (Number(res.topics[2]) / (10**7) - 10**5);
            var longitude = (Number(res.topics[3]) / (10**7) - 10**5);

            var nodeParams = {
                'name' : { num: 0},
                'location' : { num: 1},
                'phone' : { num: 2},
                'connector' : { num: 3},
                'power' : { num: 4},
            };
            for ( var param in nodeParams ){
                nodeParams[param].start = parseInt(res.data.substr(2+64*nodeParams[param].num, 64),16) * 2 + 2;
                nodeParams[param].len = parseInt(res.data.substr(nodeParams[param].start, 64), 16) * 2;
                nodeParams[param].value = this.web3js.toAscii("0x"+res.data.substr(nodeParams[param].start + 64, nodeParams[param].len));
            };

            this.registeredNodes[node] = {
                name:       nodeParams["name"].value,
                location:   nodeParams["location"].value,
                phone:      nodeParams["phone"].value,
                connector:  nodeParams["connector"].value,
                power:      nodeParams["power"].value,
                latitude:   latitude,
                longitude:  longitude
            };

        } else {
            //console.log(res);
        }

        if (Object.keys(this.sellOrders).length>0) {
            var tmpOrders = [];
            for ( var hash in this.sellOrders ){
                tmpOrders.push( this.sellOrders[ hash ] );
            }
            var newExchangeAsk = Math.min.apply(Math, tmpOrders.map( o => o.rate ));
            if (newExchangeAsk != this.exchangeAsk) {
                this.exchangeAsk = newExchangeAsk;
                //ratesChanged();
            }
        }

        if (Object.keys(this.buyOrders).length>0) {
            var tmpOrders = [];
            for ( var hash in this.buyOrders ){
                tmpOrders.push( this.buyOrders[ hash ] );
            }
            this.exchangeBid = Math.max.apply(Math, tmpOrders.map( o => o.rate ));
        }
    
    };


    // update accounts and balances
    updateAccounts() {

        var accounts = this.web3js.eth.accounts;
    
        if (!accounts.length && this.keystore !== undefined) {
            accounts = this.keystore.addresses;
        }
    
        if (accounts.length) {
            var firstAccount = accounts[0];
            if (firstAccount.substr(0, 2)!='0x') {
                firstAccount = '0x' + firstAccount;
            }
            if (this.defaultAccount != firstAccount) {
                // default account changed
                this.defaultAccount = firstAccount;
                
                if (typeof this.events['defaultAccount'] == 'function') {
                    this.events['defaultAccount'](this.defaultAccount);
                }
            }
        }

        // check the default account balances
        if (this.defaultAccount) {

            // check ETH balance
            this.web3js.eth.getBalance(this.defaultAccount, (e, r) => {
                //var bal = this.web3js.fromWei(r, "ether");
                if (typeof this.events['ethBalance'] == 'function') {
                    this.events['ethBalance'](r);
                }
            });
        
            if (this.chargContract) {

                // check CHG balance
                this.chargContract.balanceOf(this.defaultAccount, (e, r) => {
                    if (typeof this.events['chgBalance'] == 'function') {
                        this.events['chgBalance'](r);
                    }
                });

                // check CHG allowance
                this.chargContract.allowance(this.defaultAccount, this.config.serviceContractAddress, (err, r) => {
                    if (typeof this.events['allowance'] == 'function') {
                        this.events['allowance'](r);
                    }
                });

                // check ETH Market balance
                this.serviceContract.ethBalance(this.defaultAccount, (e, r) => {
                    if (typeof this.events['ethMarketBalance'] == 'function') {
                        this.events['ethMarketBalance'](r);
                    }
                });

                // check CHG Market balance
                this.serviceContract.coinBalance(this.defaultAccount, (e, r) => {
                    if (typeof this.events['chgMarketBalance'] == 'function') {
                        this.events['chgMarketBalance'](r);
                    }
                });

            };
        }  // check the default account balances
    }

    registeredNode(nodeAddr, callback) {
        this.serviceContract.registeredNodes(nodeAddr, (err, nodeData) => {
            if (typeof callback == 'function') {
                callback(err, nodeData);
            }
        });
    }

    nodeService(nodeAddr, serviceIdx, callback) {
        this.serviceContract.nodeService(nodeAddr, serviceIdx, (err, nodeData) => {
            if (typeof callback == 'function') {
                callback(err, nodeData);
            }
        });
    }

    increaseApproval(value, callback) {
        this.chargContract.increaseApproval(this.config.serviceContractAddress, value,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    depositCoins(value, callback) {
        this.serviceContract.depositCoins(value,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    depositEther(value, callback) {
        this.serviceContract.depositEther(
            { from: this.defaultAccount, value: value, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    withdrawCoins(value, callback) {
        this.serviceContract.withdrawCoins(value,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    withdrawEther(value, callback) {
        this.serviceContract.withdrawEther(value,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    buyOrder(amountGive, amountGet, expire, callback) {
        this.serviceContract.buyOrder(amountGive, amountGet, expire,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    sellOrder(amountGive, amountGet, expire, callback) {
        this.serviceContract.sellOrder(amountGive, amountGet, expire,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    buy(hash, amountGive, callback) {
        this.serviceContract.buy(hash, amountGive,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    sell(hash, amountGive, callback) {
        this.serviceContract.sell(hash, amountGive,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    registerNode( latitude, longitude, name, location, phone, connector, power, chargRate, parkRate, inetRate, callback) {
        this.serviceContract.registerNode( latitude, longitude, name, location, phone, connector, power, chargRate, parkRate, inetRate,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }

    serviceOn( nodeAddress, serviceIdx, currencyId, serviceTime, orderHash, payerHash, paymentHash, callback) {
        this.serviceContract.serviceOn( nodeAddress, serviceIdx, currencyId, serviceTime, orderHash, payerHash, paymentHash,
            { from: this.defaultAccount, value: 0, gasPrice: this.gasPrice, gas: this.gasLimit}, (error,result) => {
            if (typeof callback == 'function') {
                callback(error,result);
            }
        });
    }
}


module.exports = DApp;