/* globals setTimeout, clearTimeout */
var Transit = require('./transit.js');
var Errors = require('./errors.js');

/**
 * The ticket instance takes an single argument in the browser environment; the browser window
 *
 * @param {object} emmitter The event emitter that emits the kernel events
 * @param {Resolver} resolver the object responsible for resolving the callable from the transition
 * @param {Normalizer} is able to normalize browser events and request objects into an new transit
 * @param {Promise} the bluebird promise lib
 * @param {DOMWindow|express} [context] the window on the client & express app on the server
 */
var Ticket = function Ticket(resolver, normalizer, Promise, context) {
  var self = this;

  /**
   * The the context in which we are running, on the server this is server instance
   * in the browser this is the dom window
   * 
   * @type {DOMWindow|express}
   */
  self.context = context;

  /**
   * Tells us if we are executing on the server or in the browser
   *
   * @method isServer()
   * @return {Boolean} 
   */
  self.isServer = function isServer() {
    return ((self.context.document === undefined) ? (true) : (false));
  };

  /**
   * Handle the normalized transit throughout its livecycle
   *
   * @method handle()
   * @param  {Transit} transit the transit
   * @return {Promise} resolves when transit is handled
   */
  self.handle = function handle(transit) {
    var deferred = transit.deferred;

    //deconstruct state
    var started = transit.start();

    transit.controller.scope = resolver.getScope(transit);
    transit.controller.args = resolver.getArguments(transit);
      if(typeof transit.controller.fn !== 'function')
        transit.controller.fn = resolver.getFunction(transit);

    //reject when controller run takes to long
    var timer = setTimeout(function(){
      deferred.reject(new Errors.ControllerTimeout('Controller for transit to url "' + transit.url + '" exceeded maximum execution time of: "'+transit.timeout+'ms", did the controller call render?'));
    }, transit.timeout);

    //run controller
    var ended = transit.run().then(function(){
      clearTimeout(timer);

      //when ran, end the transit
      return transit.end();
    }, function(err){
      deferred.reject(err);
    });

    //when everything is finished, resolve it with new state
    Promise.all([started, ended]).then(function(){
      transit.terminate();

      //when start and end it complete resolve the transit
      deferred.resolve(transit.to);
    }, function(err){
      deferred.reject(err);
    });

    return deferred.promise;
  };


  /**
   * Install the kernel with the handler to handle transits
   *   
   * @param  {Function} fn the transit handler
   * @return {[type]}      [description]
   */
  self.install = function install(fn) {
    var doHandle = function(t, args) {
        fn(t, args);
        try {
          self.handle(t);  
        } catch(err) {
          t.deferred.reject(err);
        }
    };

    if(self.isServer()) {
      self.context.use(function(req, res, next){
        var t = self.normalize(req, res);
        doHandle(t, arguments);
      });
    } else {
      self.context.document.onclick = function(e) {      
        var t = self.normalize(e);
        if(t === false || t === undefined)
          return;

        doHandle(t, arguments);
      };
    }
  };

  /**
   * Normalize the event for each environment, in the browser this is the click event, on the 
   * server the request/res object
   *
   * @method normalize()
   * @param  {DOMEvent|req} the event/request
   * @param  {res} [res] the response object of the server
   */
  self.normalize = function normalize() {

    if(self.isServer()) {
      if(arguments.length !== 2) {
        throw new Error('[SERVER] normalize() expects 2 arguments, received: '+ arguments.length);
      }        

      var req = arguments[0];
      var res = arguments[1];

      if(req.url === undefined)
        throw new Error('[SERVER] normalize() expects first arguments to be an req object with an url, received: '+ req);

      if(res.statusCode === undefined)
        throw new Error('[SERVER] normalize() expects second arguments to be an res object with a statusCode, received: '+ req);

      return normalizer.normalizeServerRequest(req, res);

    } else {

      var e = arguments[0];      
      if(e === undefined || e.currentTarget === undefined) {
        throw new Error('[CLIENT] normalize() expects argument to be an DOMEvent, received:' + e);
      }

      return normalizer.normalizeBrowserEvent(e);

    }

  };

};

module.exports = Ticket;