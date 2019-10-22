//var DApp = require('./dapp.js');

// set hooked callback modal for the password
window.passwordProviderCallback = null;
/*
window.hookedPasswordProvider = (callback) => {
    window.passwordProviderCallback = callback;
    $("#lightwallet-sign-modal").modal();
};
*/
config = require("../../app.config.json");

var dappModule = new DApp(config, {
    nodeAddress: null,
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
        //$("#create-wallet-seed").text(app.secretSeed);
    }
    $('#account-block').css('display','block');
    $('#eth-network').text( dappModule.ethNetwork );
    console.log( dappModule.ethNetwork );
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
                console.log(error,result);
                if (!error) {
                    $(".transaction-link").html("<a target='_blank' href='"+config.scanUrl+"/tx/"+result+"'>"+result+"</a>");
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
        //document.getElementById("btn-create-lightwallet-account").style.display = 'block';
        //document.getElementById("create-wallet-seed").innerHtml = app.secretSeed;
        $("#btn-create-lightwallet-account").css('display', 'block');
        $("#create-wallet-seed").text(seed);
    }
    //document.getElementById("account-block").style.display = 'block';
    $('#account-block').css('display','block');
});


//dappModule.on('newBlock', console.log)

dappModule.on('updateOrders', (sellOrders, buyOrders) => {

    //console.log(sellOrders, buyOrders);
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
    //console.log(sellOrdersTable, buyOrdersTable);

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


    $("#btn-create-lightwallet-account").click(() => {
        $("#create-lightwallet-account-modal").modal();
    });

    $("#btn-do-create-lightwallet-account").click(() => {
        var password = $("#create-lightwallet-account-password").val();
        dappModule.createLightWalletAccount(password);
        $('#create-lightwallet-account-modal').modal('hide'); 
    });

    $("#btn-do-lightwallet-sign").click(() => {
        console.log(window.passwordProviderCallback);
        if (window.passwordProviderCallback) {
            window.passwordProviderCallback(null, $('#lightwallet-sign-password').val());
        }
        $("#lightwallet-sign-modal").modal('hide');
    });

});
