const { print, wait, format } = require('./utils');
const Orders = require('./orders');

const BNB_COMMISION   = 0.0005;

class Trading {

	constructor(io, option) {
		console.log("options:", option);
		this.io = io;
		this.option = option;
		this.quantity = option.quantity;
		this.stop_loss = option.stop_loss;
		this.increasing = option.increasing;
		this.decreasing = option.decreasing;	
		this.wait_time = option.wait_time;	

		// Define trade vars  
		this.order_id = 0;
		this.order_data = null;
   
    	this.buy_filled = true
    	this.sell_filled = true

    	this.buy_filled_qty = 0
    	this.sell_filled_qty = 0

    	// percent (When you drop 10%, sell panic.)
    	this.stop_loss = 0

   		//BTC amount
    	this.amount = 0

    	// float(step_size * math.floor(float(free)/step_size))
    	this.step_size = 0
		/*
		    # Define static vars
		    WAIT_TIME_BUY_SELL = 1 # seconds
		    WAIT_TIME_CHECK_BUY_SELL = 0.2 # seconds
		    WAIT_TIME_CHECK_SELL = 5 # seconds
		    WAIT_TIME_STOP_LOSS = 20 # seconds

		    MAX_TRADE_SIZE = 7 # int
		*/
    	// Type of commision, Default BNB_COMMISION
    	this.commision = BNB_COMMISION		
	}

	async filters() {
        let symbol = this.option.symbol;

        //Get symbol exchange info
        let symbol_info = await Orders.get_info(symbol);

        if (!symbol_info) {
            //print('Invalid symbol, please try again...')
            print('Invalid symbol, please try again...');
            process.exit(1);
        }

        //symbol_info['filters'] = {item['filterType']: item for item in symbol_info['filters']}
        for (let filter of symbol_info['filters']) {
        	symbol_info.filters[filter.filterType] = filter;
        }
        return symbol_info.filters;        
    }


	async validate() {
		let valid = true;
        let symbol = this.option.symbol;
        let filters = await this.filters();

        //Order book prices
        let last = await Orders.get_order_book(symbol)

        let lastPrice = await Orders.get_ticker(symbol);

        let minQty = parseFloat(filters.LOT_SIZE.minQty)
        let minPrice = parseFloat(filters.PRICE_FILTER.minPrice)
        let minNotional = parseFloat(filters.MIN_NOTIONAL.minNotional)
        let quantity = parseFloat(this.option.quantity)

        //stepSize defines the intervals that a quantity/icebergQty can be increased/decreased by.
        let stepSize = parseFloat(filters.LOT_SIZE.stepSize)

        //tickSize defines the intervals that a price/stopPrice can be increased/decreased by
        let tickSize = parseFloat(filters.PRICE_FILTER.tickSize)

        //If option increasing default tickSize greater than
        if (parseFloat(this.option.increasing) < tickSize){
            this.increasing = tickSize
        }

        //If option decreasing default tickSize greater than
        if (parseFloat(this.option.decreasing) < tickSize){
            this.decreasing = tickSize
        }

        // Just for validation
        last.lastBid = last.lastBid + this.increasing

        // Set static
        // If quantity or amount is zero, minNotional increase 10%
        quantity = (minNotional / last.lastBid)
        quantity = quantity + (quantity * 10 / 100)
        let notional = minNotional

        if (this.amount > 0) {
            // Calculate amount to quantity
            quantity = (this.amount / lastBid)
        }
        if (this.quantity > 0) {
            // Format quantity step
            quantity = this.quantity
		}
        quantity = this.format_step(quantity, stepSize)
        notional = last.lastBid * parseFloat(quantity)

        // Set Globals
        this.quantity = quantity
        this.step_size = stepSize

        // minQty = minimum order quantity
        if (quantity < minQty) {
            //print('Invalid quantity, minQty: %.8f (u: %.8f)' % (minQty, quantity))
            print('Invalid quantity, minQty: %.8f (u: %.8f)' , minQty, quantity)
            valid = false
        }

        if (lastPrice < minPrice) {
            //print('Invalid price, minPrice: %.8f (u: %.8f)' % (minPrice, lastPrice))
            print('Invalid price, minPrice: %.8f (u: %.8f)' , minPrice, lastPrice)
            valid = false
        }

        //minNotional = minimum order value (price * quantity)
        if (notional < minNotional) {
            //print('Invalid notional, minNotional: %.8f (u: %.8f)' % (minNotional, notional))
            print('Invalid notional, minNotional: %.8f (u: %.8f)' ,minNotional, notional)
            valid = false
        }

        if (!valid) {
            process.exit(1)
        }
        
    }

    format_step(quantity, stepSize){
        return parseFloat(stepSize * Math.floor(parseFloat(quantity)/stepSize))
    }

    calc(lastBid){ 
        try {
            //Estimated sell price considering commision
            return lastBid + (lastBid * this.option.profit / 100) + (lastBid *this.commision);
            //return lastBid + (lastBid * self.option.profit / 100)

        } catch (err) {
            print('Calc Error: %s', e);
            return
        }
    }

	async action(symbol) {
        //import ipdb; ipdb.set_trace()

        //Order amount
        let quantity = this.quantity;

        //Fetches the ticker price
        let lastPrice = await Orders.get_ticker(symbol);

        // Order book prices
        let last = await Orders.get_order_book(symbol)

        //Target buy price, add little increase #87
        let buyPrice = last.lastBid + this.increasing

        //Target sell price, decrease little 
        let sellPrice = last.lastAsk - this.decreasing

        // Spread ( profit )
        let profitableSellingPrice = this.calc(last.lastBid)

        // Check working mode
        if (this.option.mode == 'range') {
            buyPrice = this.option.buyprice
            sellPrice = this.option.sellprice
            profitableSellingPrice = sellPrice
        }

        // Screen log
        if (this.option.prints && this.order_id == 0) {
            let spreadPerc = (last.lastAsk/last.lastBid - 1) * 100.0
			//#print('price:%.8f buyp:%.8f sellp:%.8f-bid:%.8f ask:%.8f spread:%.2f' % (lastPrice, buyPrice, profitableSellingPrice, lastBid, lastAsk, spreadPerc))
            //print('price: %.8f buyprice: %.8f sellprice: %.8f bid: %.8f ask: %.8f spread: %.2f Originalsellprice: %.8f' ,lastPrice, buyPrice, profitableSellingPrice, last.lastBid, last.lastAsk, spreadPerc, profitableSellingPrice-(last.lastBid *this.commision))
            this.io.emit('update', {symbol:symbol,lastPrice:format(lastPrice), buyPrice:format(buyPrice), profitableSellingPrice: format(profitableSellingPrice), lastBid: format(last.lastBid), lastAsk: format(last.lastAsk), spreadPerc: format(spreadPerc), originalsellprice: format(profitableSellingPrice-(last.lastBid *this.commision)) });
		}
        // analyze = threading.Thread(target=analyze, args=(symbol,))
        // analyze.start()
        

        if (this.order_id > 0) {
            //Profit mode
            if (this.order_data != null) {

                order = this.order_data

                // Last control
                let newProfitableSellingPrice = this.calc(parseFloat(order.price))

                if (last.lastAsk >= newProfitableSellingPrice){
                    profitableSellingPrice = newProfitableSellingPrice
                }
            }
            //range mode
            if (self.option.mode == 'range') {
                profitableSellingPrice = this.option.sellprice
            }
                       
            // If the order is complete, try to sell it.            

            // Perform buy action
            this.sell(symbol, quantity, self.order_id, profitableSellingPrice, lastPrice);            
            return
        }

        /*
        Did profit get caught
        if ask price is greater than profit price, 
        buy with my buy price,    
        */
        if ((last.lastAsk >= profitableSellingPrice && this.option.mode == 'profit') || (lastPrice <= this.option.buyprice && this.option.mode == 'range')) {
            print ("Mode: %s, Lastsk: %s, Profit Sell Price %s, ", this.option.mode, lastAsk, profitableSellingPrice);

            if (this.order_id == 0) {
                this.buy(symbol, quantity, buyPrice, profitableSellingPrice);

                //# Perform check/sell action
                //# checkAction = threading.Thread(target=self.check, args=(symbol, self.order_id, quantity,))
                //# checkAction.start()
            }          
        }
    }  

	async run() {
		let cycle = 0;
        let actions = [];

        let symbol = this.option.symbol;

        print('Auto Trading for Binance.com. @yasinkuyu Thrashformer');
        // Validate symbol
        await this.validate();

        print('Started...');
        print('Trading Symbol: %s', symbol);
        print('Buy Quantity: %.8f', this.quantity);
        print('Stop-Loss Amount: %s', this.stop_loss);
        //console.log('Estimated profit: %.8f' % (self.quantity*self.option.profit))

        if (this.option.mode == 'range') {
/*
           if self.option.buyprice == 0 or self.option.sellprice == 0:
               print('Please enter --buyprice / --sellprice\n')
               exit(1)

           print('Range Mode Options:')
           print('\tBuy Price: %.8f', self.option.buyprice)
           print('\tSell Price: %.8f', self.option.sellprice)
*/
        } else {
            print('Profit Mode Options:');
            print('\tPreferred Profit: %0.2f%%', this.option.profit);
            print('\tBuy Price : (Bid+ --increasing %.8f)', this.increasing);
            print('\tSell Price: (Ask- --decreasing %.8f)', this.decreasing);
        }

        print('\n');

        let startTime = new Date().getTime();
        let endTime = new Date().getTime();
/*
        """
        # DEBUG LINES
        actionTrader = threading.Thread(target=self.action, args=(symbol,))
        actions.append(actionTrader)
        actionTrader.start()
        let endTime = time.time()
        if endTime - startTime < self.wait_time:
            time.sleep(self.wait_time - (endTime - startTime))
            # 0 = Unlimited loop
            if self.option.loop > 0:
                cycle = cycle + 1
        """
*/

        while (cycle <= this.option.loop) {
        	startTime = new Date().getTime();

        	await this.action(symbol);
           	//actionTrader = threading.Thread(target=self.action, args=(symbol,))
           	//actions.append(actionTrader)
           	//actionTrader.start()
           	endTime = new Date().getTime();

           	if (endTime - startTime < this.wait_time) {

               await wait(this.wait_time - (endTime - startTime))

               // 0 = Unlimited loop
               if (self.option.loop > 0){
                   cycle = cycle + 1
               }
           }           
        }
	}
}

module.exports.Trading = Trading