var DApp = require('./dapp.js');
var config = require("../../app.config.json");
var params={}; window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(str,key,value){ params[key]=value });

var app = {};
app.clientMAC = document.getElementById("client-mac").innerText;
app.nodeAddress = document.getElementById("node-id").innerText;
app.local = true;
app.timeConvert = 3600; //hour to sec
app.currency = "CHG";
app.services = ["charg", "park"];
if (app.local) {
    // wifi service only in local p2p version
    app.services.push("inet");
}
app.cost = {};
app.total = {};
app.services.forEach(service => {
    app.cost[service] = 0;
    app.total[service] = 0;
});

if (params.node) { 
    app.nodeAddress = params.node; 
    //app.local = false; 
}

console.log(app.nodeAddress);
console.log(app.clientMAC);

var dappModule = new DApp(config, {
    nodeAddress: app.nodeAddress,
    //clientMAC: app.clientMAC,
    hookedPasswordProvider: function(callback) {
        window.passwordProviderCallback = callback;
        $("#lightwallet-sign-modal").modal();
    }
});

//dappModule.on('newSwapCoin', console.log);
//dappModule.on('newService', console.log);
//dappModule.on('newNodeService', console.log);

dappModule.on('defaultAccount', (account) => {
    if (account.length>0) {
        $('#eth-account').attr("href", `${config.scanUrl}/address/${account}`);
        if (typeof qrcode != 'undefined') {
            var qr = qrcode(4, 'L');
            qr.addData(account);
            qr.make();
            $('#qrcode-img').html(qr.createImgTag());
        }
        $('#balances-block').css('display','block');
    } else {
        $("#btn-create-lightwallet-account").css('display', 'block');
    }
    $('#account-block').css('display','block');
    $('#eth-net').text( dappModule.ethNetwork );
    
    if ( $('#btn-register-node').length ) {
        dappModule.registeredNode(account, (err, node) => {

            if (node[0]) {  // if registered

                $("#node-register-title").html("Your node is registered, you can update parameters");
                $('#btn-register-node').attr('registered',true);
                $('#btn-register-node').html('Update the Node');
                $("#input-register-node-name").val(node[4]);
                $("#input-register-node-phone").val(node[5]);
                $("#input-register-node-location").val(node[6]);
                $("#input-register-node-connector").val(node[7]);
                $("#input-register-node-power").val(node[8]);

                app.services.forEach( (service, serviceIdx) => {
                    $("#input-register-node-"+service+"-rate").val(0);
                    dappModule.nodeService(account, serviceIdx, (err, serviceData) => {
                        if (err) throw new Error('nodeService');
                        app.cost[service] = (serviceData[1].toFixed(0) * app.timeConvert / (10**18)).toFixed(3);
                        $("#input-register-node-"+service+"-rate").val(app.cost[service]);
                    });
                });

                var latitude = (Number(node[2]) / (10**7) - 10**5);
                var longitude = (Number(node[3]) / (10**7) - 10**5);
    
                $("#input-register-node-latitude").val(latitude);
                $("#input-register-node-longitude").val(longitude);
                if (map != 'undefined') {
                    marker.setPosition( {lat: latitude, lng: longitude} );
                    map.panTo( {lat: latitude, lng: longitude} );
                }
            }
        });
    }
});

dappModule.on('registeredNode', (err, node) => {
    if (err) {
        console.error(err);
        return;
    }

    if (!node[0] || !node[1]) {
        $("#node-not-registered").css("display","block");
        return;
    } 

    $("#node-name").text(node[4]);
    $("#node-phone").text(node[5]);
    $("#node-location").text(node[6]);
    $("#node-connector").text(node[7]);
    $("#node-power").text(node[8]);

    /*
    ['name','location','phone','connector','power'].forEach((param)=>{
        app.serviceContract.nodeParameters(app.nodeAddr, app.web3js.sha3(param), (err, value) => {
            $("#node-"+param).text(value);
        });
    });
    */

    $("#node-registered").css("display","block");
    $('#node-addr').html(`<a target='_blank' href='${config.scanUrl}/address/${app.nodeAddress}'>Show on Etherscan</a>`);
    $('#node-block').css('display','block');

    app.services.forEach((service, serviceIdx)=>{
        dappModule.nodeService(app.nodeAddress, serviceIdx, (err, serviceData) => {
            if (err) throw new Error('nodeService');
            app.cost[service] = (serviceData[1].toFixed(0) * app.timeConvert / (10**18)).toFixed(3);
            if (app.cost[service]==0) {
                $("."+service+"-block").css('display', 'none');
            } else {
                $("."+service+"-block").css('display', 'block');
                $("#"+service+"-price").html(app.cost[service]);
            }
        });
        if ($('#btn-'+service+'-start').length) {
            
            $('#btn-'+service+'-start').on('click', () => {

                var currencyId = 0;                                                      // CHG
                var serviceTime = app.timeConvert * $("#"+service+"-hours-input").val(); // time in sec
                var orderHash = dappModule.web3js.sha3(dappModule.defaultAccount + Math.random());     // hash of exchange sell order (not used for CHG)
                var payerHash = dappModule.web3js.sha3(dappModule.defaultAccount);                     // hashed payer identificator (MAC, Cookie ID, etc...)
                var paymentHash = dappModule.web3js.sha3(dappModule.defaultAccount + Math.random());   // hash of the payment transaction

                $('#btn-'+service+'-start').prop('disabled', true);
                dappModule.serviceOn(app.nodeAddress, serviceIdx, currencyId, serviceTime, orderHash, payerHash, paymentHash, (error, result) => {
                        if (!error) {
                        $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                        $(".transaction-view").css("display","block");
                    }
                    $('#btn-'+service+'-start').prop('disabled', false);
                });
            });
        }

        if ($("#"+service+"-hours-input").length) {
            $("#"+service+"-hours-input").on('change', () => {
                app.total[service] = ($("#"+service+"-hours-input").val() * app.cost[service]).toFixed(3);
                $("#"+service+"-total").text(app.total[service]);
            });
        }
    });

    $("#select-currency").on("change", function(){
        //console.log(this.value);
        //app.currencyChanged(this.value);
    });

});

dappModule.on('ethBalance', (b) => {
    var bal = b.dividedBy(10**18).toFixed(5);
    $("#eth-balance").text(bal);
    $("#eth-wallet-balance").text(bal);
});

dappModule.on('chgBalance', (b) => {
    var bal = b.dividedBy(10**18).toFixed(1);
    $("#chg-balance").text(bal);
    $("#chg-wallet-balance").text(bal);
});

dappModule.on('ethMarketBalance', (b) => {
    var bal = b.dividedBy(10**18).toFixed(5);
    $("#eth-market-balance").text(bal);
});

dappModule.on('chgMarketBalance', (b) => {
    var bal = b.dividedBy(10**18).toFixed(1);
    $("#chg-market-balance").text(bal);
});

dappModule.on('allowance', (allowance) => {
    if (allowance.lt(10**24)) {
        $("#allowance-warning").css("display","block");
        $(".do-allowance-unlock").click(()=>{
            if (dappModule.useLightWallet) {
                //dappModule.keystore.passwordProvider = window.hookedPasswordProvider;
            };
            dappModule.increaseApproval(10**32, (error,result) => {
                if (!error) {
                    $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                    $(".transaction-view").css("display","block");
                }
                $("#allowance-modal").modal('hide');
                $("#allowance-warning").css("display","none");
            });
        });
    }
});

dappModule.on('lightWallet', (e, seed) => {
    if (e) {
        $("#btn-create-lightwallet-account").css('display', 'block');
        $("#create-wallet-seed").text(seed);
    }
    $('#account-block').css('display','block');
});

//dappModule.on('newBlock', console.log)

dappModule.on('registeredNodes', ( registeredNodes ) => {

    $("#nodes-list-table").html("");

    var infowindow;
    var marker;

    if (typeof map !== 'undefined') {
        infowindow = new google.maps.InfoWindow();
    }

    for ( var nodeAddr in registeredNodes ){

        var node = registeredNodes[nodeAddr];

        if ((typeof map !== 'undefined') && (nodeAddr !== dappModule.defaultAccount)) {

            var info = `
            <center class='onmap-info' style='color:navy'>
                <a href='splash.html?node=${nodeAddr}'><h6>${node.name}</h6></a>
                <strong>${node.connector} - ${node.power}</strong><br/>
                <a href='tel:${node.phone}'>${node.phone}</a>
            </center>
            `;

            marker = new google.maps.Marker({
                //label: node.name,
                icon: {
                    url: "http://maps.google.com/mapfiles/ms/icons/pink-dot.png"
                },
                info: info,
                position: {lat: node.latitude, lng: node.longitude },
                map: map
            });

            google.maps.event.addListener(marker, 'click', (function(marker) {
                return function() {
                    infowindow.setContent(marker.info);
                    infowindow.open(map, marker);
                }
            })(marker));
    
            if( map.center.lat()==0 && map.center.lng()==0) {
                map.setCenter({lat: node.latitude, lng: node.longitude });
            }
        }

        if ($("#nodes-list-table").length > 0) {
            var tableRow = `<tr addr="${nodeAddr}">
                <td><a href='splash.html?node=${nodeAddr}'>${node.name}</a></td>
                <td>${node.location}</td>
                <td><a href='tel:${node.phone}'>${node.phone}</a></td>
                <td>${node.connector}</td>
                <td>${node.power}</td>
            </tr>`;
            $("#nodes-list-table").append(tableRow);
        }
    }

});

if( $("#sell-orders-table").length>0 || $("#buy-orders-table").length>0 ) {
    //if order book tables exists
    dappModule.on('updateOrders', (sellOrders, buyOrders) => {
        
        if (Object.keys(sellOrders).length>0) {
            var sellOrdersTable = [];
            for ( var hash in sellOrders ){
                sellOrdersTable.push( sellOrders[ hash ] );
            }
        }
        if (Object.keys(buyOrders).length>0) {
            var buyOrdersTable = [];
            for ( var hash in buyOrders ){
                buyOrdersTable.push( buyOrders[ hash ] );
            }
        }
        sellOrdersTable.sort((a, b) => (a.rate > b.rate) ? 1 : (a.rate === b.rate) ? ((a.volume > b.volume) ? 1 : -1) : -1 );
        buyOrdersTable.sort((a, b) => (a.rate < b.rate) ? 1 : (a.rate === b.rate) ? ((a.volume > b.volume) ? 1 : -1) : -1 );
    
        $("#sell-orders-table").html("");
        sellOrdersTable.forEach((row) => {
            var tableRow = `<tr hash="${row.hash}" type="sell" expire="${row.expire}"  get="${row.get}" give="${row.give}" rate="${row.rate}"><td>${row.rate}</td><td>${row.give}</td></tr>`;
            $("#sell-orders-table").append(tableRow);
        });
    
        $("#buy-orders-table").html("");
        buyOrdersTable.forEach((row) => {
            var tableRow = `<tr hash="${row.hash}" type="buy" expire="${row.expire}" get="${row.get}" give="${row.give}" rate="${row.rate}" ><td>${row.rate}</td><td>${row.get}</td></tr>`;
            $("#buy-orders-table").append(tableRow);
        });
    
        $('.table > tbody > tr').click( (e) => {
            var hash = e.currentTarget.getAttribute('hash');
            var type = e.currentTarget.getAttribute('type');
            var give = e.currentTarget.getAttribute('give');
            var get = e.currentTarget.getAttribute('get');
            var expire = e.currentTarget.getAttribute('expire');
            var rate = e.currentTarget.getAttribute('rate');
    
            if (type=="sell") {
                $("#chg-buy-info").html(`Order: ${give} CHG @ ${rate} CHG/ETH expire on ${expire} `);
                $("#chg-buy-info").attr('hash', hash);
                $("#chg-buy-info").attr('rate', rate);
                $("#chg-buy-amount").attr('max', give);
                $("#chg-buy-amount").val(give);
                $("#eth-give-amount").text(get);
                $("#chg-buy-modal").modal();
            } else if (type=="buy") {
                $("#chg-sell-info").html(`Order: ${get} CHG @ ${rate} CHG/ETH expire on ${expire} `);
                $("#chg-sell-info").attr('hash', hash);
                $("#chg-sell-info").attr('rate', rate);
                $("#chg-sell-amount").attr('max', get);
                $("#chg-sell-amount").val(get);
                $("#eth-get-amount").text(give);
                $("#chg-sell-modal").modal();
            }
        });
    });
} //if order book tables exists


$(function() {

    $("input[type='number']").inputSpinner();

    $("#btn-chg-deposit").click(() => {
        var value = 10**18 * $("#chg-amount-input").val();
        $('#btn-chg-deposit').prop('disabled', true);
        dappModule.depositCoins(value, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $('#btn-chg-deposit').prop('disabled', false);
        });
    });

    $("#btn-chg-withdraw").click(() => {
        var value = 10**18 * $("#chg-amount-input").val();
        $('#btn-chg-withdraw').prop('disabled', true);
        dappModule.withdrawCoins(value, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $('#btn-chg-withdraw').prop('disabled', false);
        });
    });

    $("#btn-eth-deposit").click(() => {
        var value = 10**18 * $("#eth-amount-input").val();
        $('#btn-eth-deposit').prop('disabled', true);
        dappModule.depositEther(value, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $('#btn-eth-deposit').prop('disabled', false);
        });
    });

    $("#btn-eth-withdraw").click(() => {
        var value = 10**18 * $("#eth-amount-input").val();
        $('#btn-eth-withdraw').prop('disabled', true);
        dappModule.withdrawEther(value, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $('#btn-eth-withdraw').prop('disabled', false);
        });
    });


    $('#btn-chg-buy').click(() => {
        var hash = $("#chg-buy-info").attr('hash');
        var give = 10**18 * $("#eth-give-amount").text();
        $('#btn-chg-buy').prop('disabled', true);
        dappModule.buy(hash, give, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $("#chg-buy-modal").modal('hide');
            $('#btn-chg-buy').prop('disabled', false);
        });
    });

    $("#chg-buy-amount").on("change", () => {
        var rate = $("#chg-buy-info").attr('rate');
        var ethAmt = ($("#chg-buy-amount").val() * rate).toFixed(5);
        $("#eth-give-amount").text(ethAmt);
    });

    $('#btn-chg-sell').click(() => {
        var hash = $("#chg-sell-info").attr('hash');
        var give = 10**18 * $("#chg-sell-amount").val();
        $('#btn-chg-sell').prop('disabled', true);
        dappModule.sell(hash, give, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $("#chg-sell-modal").modal('hide');
            $('#btn-chg-sell').prop('disabled', false);
        });
    });

    $("#chg-sell-amount").on("change", () => {
        var rate = $("#chg-sell-info").attr('rate');
        var ethAmt = ($("#chg-sell-amount").val() * rate).toFixed(5);
        $("#eth-get-amount").text(ethAmt);
    });

    $("#btn-new-buy-order").click(()=>{
        $("#chg-buy-order-modal").modal();
    });

    $("#btn-new-sell-order").click(()=>{
        $("#chg-sell-order-modal").modal();
    });

    $("#chg-buy-order-amount").on("change", () => {
        var rate = $("#chg-buy-order-rate").val();
        var chgAmt = $("#chg-buy-order-amount").val();
        var ethAmt = (chgAmt * rate).toFixed(5);
        $("#eth-buy-order-amount").val(ethAmt);
    });

    $("#chg-buy-order-rate").on("change", () => {
        var rate = $("#chg-buy-order-rate").val();
        var chgAmt = $("#chg-buy-order-amount").val();
        var ethAmt = (chgAmt * rate).toFixed(5);
        $("#eth-buy-order-amount").val(ethAmt);
    });

    $("#eth-buy-order-amount").on("change", () => {
        var chgAmt = $("#chg-buy-order-amount").val();
        var ethAmt = $("#eth-buy-order-amount").val();
        var rate = chgAmt>0 ? (ethAmt/chgAmt).toFixed(7) : 0;
        $("#chg-buy-order-rate").val(rate);
    });

    $("#chg-sell-order-amount").on("change", () => {
        var rate = $("#chg-sell-order-rate").val();
        var chgAmt = $("#chg-sell-order-amount").val();
        var ethAmt = (chgAmt * rate).toFixed(5);
        $("#eth-sell-order-amount").val(ethAmt);
    });

    $("#chg-sell-order-rate").on("change", () => {
        var rate = $("#chg-sell-order-rate").val();
        var chgAmt = $("#chg-sell-order-amount").val();
        var ethAmt = (chgAmt * rate).toFixed(5);
        $("#eth-sell-order-amount").val(ethAmt);
    });

    $("#eth-sell-order-amount").on("change", () => {
        var chgAmt = $("#chg-sell-order-amount").val();
        var ethAmt = $("#eth-sell-order-amount").val();
        var rate = chgAmt>0 ? (ethAmt/chgAmt).toFixed(7) : 0;
        $("#chg-sell-order-rate").val(rate);
    });

    $('#btn-chg-buy-order-add').click(() => {
        var get  = 10**18 * $("#chg-buy-order-amount").val();
        var give = 10**18 * $("#eth-buy-order-amount").val();
        var expire  = $("#chg-buy-order-expire").val();
        $('#btn-chg-buy-order-add').prop('disabled', true);
        dappModule.buyOrder( give, get, expire, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $("#chg-buy-order-modal").modal('hide');
            $('#btn-chg-buy-order-add').prop('disabled', false);
        });
    });

    $('#btn-chg-sell-order-add').click(() => {
        var get  = 10**18 * $("#eth-sell-order-amount").val();
        var give = 10**18 * $("#chg-sell-order-amount").val();
        var expire  = $("#chg-buy-order-expire").val();
        $('#btn-chg-sell-order-add').prop('disabled', true);
        dappModule.sellOrder( give, get, expire, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $("#chg-sell-order-modal").modal('hide');
            $('#btn-chg-sell-order-add').prop('disabled', false);
        });
    });

    $('#btn-register-node').click(() => {

        var latitude  = (10**7 * (10**5 + Number($("#input-register-node-latitude").val())) ).toFixed(0);
        var longitude  = (10**7 * (10**5 + Number($("#input-register-node-longitude").val())) ).toFixed(0);

        var name = $("#input-register-node-name").val();
        var location = $("#input-register-node-location").val();
        var phone = $("#input-register-node-phone").val();
        var connector = $("#input-register-node-connector").val();
        var power = $("#input-register-node-power").val();

        var chargRate = (10**18 / app.timeConvert * $("#input-register-node-charg-rate").val()).toFixed(0);
        var parkRate = (10**18 / app.timeConvert * $("#input-register-node-park-rate").val()).toFixed(0);
        var inetRate = (10**18 / app.timeConvert * $("#input-register-node-inet-rate").val()).toFixed(0);

        $('#btn-register-node').prop('disabled', true);

        dappModule.registerNode( latitude, longitude, name, location, phone, connector, power, chargRate, parkRate, inetRate, (error, result) => {
            if (!error) {
                $(".transaction-link").html("The transaction is <a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'> signed and sent </a>");
                $(".transaction-view").css("display","block");
            }
            $('#btn-register-node').prop('disabled', false);
        });
    });

    $("#btn-create-lightwallet-account").click(() => {
        $("#create-lightwallet-account-modal").modal();
    });

    $("#btn-do-create-lightwallet-account").click(() => {
        var password = $("#create-lightwallet-account-password").val();
        dappModule.createLightWalletAccount(password);
        $('#create-lightwallet-account-modal').modal('hide'); 
    });

    $("#btn-do-lightwallet-sign").click(() => {
        if (window.passwordProviderCallback) {
            window.passwordProviderCallback(null, $('#lightwallet-sign-password').val());
        }
        $("#lightwallet-sign-modal").modal('hide');
    });

    //check if opened in android
    var isAndroid = function() {
        var check = false;
        (function(a){if(/android/i.test(a)) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
        return check;
    };
    if (isAndroid()) {
        $("#mobile").html('<a href="intent://charg.io:eth='+app.nodeAddress+'"> \
         <img src="images/google-play-badge.png" width=280px border="0" ></a>');
    }

});
