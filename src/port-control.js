var PortControl = function (dispatchEvent) {
  this.dispatchEvent = dispatchEvent;
};

/** 
* Closes the OS-level sockets and discards its Freedom object
* @method closeSocket
* @param {freedom_UdpSocket.Socket} socket The socket object to close
*/
PortControl.prototype.closeSocket = function (socket) {
  socket.destroy().then(function () {
    freedom['core.udpsocket'].close(socket);
  });
};

/**
* Probe if NAT-PMP is supported by the router
* @method probePmpSupport
* @param {string} routerIp The IP address that the router can be reached at
* @param {string} privateIp The private IP address of the user's computer
* @return {Promise<boolean>} A promise for a boolean
*/ 
PortControl.prototype.probePmpSupport = function (routerIp, privateIp) {
  return this.sendPmpRequest().then(function (pmpResponse) {
    return true;
  }).catch(function (err) {
    return false;
  });
};

/**
* Sends a NAT-PMP request to the router to open/map a port
* @method sendPmpRequest
* @param {string} routerIp The IP address that the router can be reached at
* @param {string} [internalPort=55555] The internal port on the computer to map to
* @param {string} [externalPort=55555] The external port on the router to map to
* @return {Promise<Object>} A promise that fulfills with the NAT-PMP response, or rejects on timeout
*/
PortControl.prototype.sendPmpRequest = function (routerIp, internalPort, externalPort) {
  var socket;
  if (internalPort === undefined) { internalPort = 55555; }
  if (externalPort === undefined) { externalPort = internalPort; }

  var _sendPmpRequest = new Promise(function (F, R) {
    socket = freedom['core.udpsocket']();

    // Fulfill when we get any reply (failure is on timeout in wrapper function)
    socket.on('onData', function (pmpResponse) {
      this.closeSocket(socket);
      F(pmpResponse);
    });

    // Bind a UDP port and send a NAT-PMP request
    socket.bind(privateIp, 0).
        then(function (result) {
          if (result !== 0) {
            R(new Error('Failed to bind to a port: Err= ' + result));
          }

          // Construct the NAT-PMP map request as an ArrayBuffer
          // Map internal port 55555 to external port 55555 w/ 120 sec lifetime
          var pmpBuffer = new ArrayBuffer(12);
          var pmpView = new DataView(pmpBuffer);
          // Version and OP fields (1 byte each)
          pmpView.setInt8(0, 0);
          pmpView.setInt8(1, 1);
          // Reserved, internal port, external port fields (2 bytes each)
          pmpView.setInt16(2, 0, false);
          pmpView.setInt16(4, internalPort, false);
          pmpView.setInt16(6, externalPort, false);
          // Mapping lifetime field (4 bytes)
          pmpView.setInt32(8, 120, false);

          socket.sendTo(pmpBuffer, routerIp, 5351);
        });
  });

  // Give _sendPmpRequest 2 seconds before timing out
  return Promise.race([
    this.countdownReject(2000, 'No NAT-PMP response', function () { 
      this.closeSocket(socket); 
    }),
    _sendPmpRequest
  ]);
};

/**
* Return a promise that rejects in a given time with an Error message,
* and can call a callback function before rejecting
* @method countdownReject
* @param {number} time Time in seconds
* @param {number} msg Message to encapsulate in the rejected Error
* @param {function} callback Function to call before rejecting
* @return {Promise} A promise that will reject in the given time
*/
PortControl.prototype.countdownReject = function (time, msg, callback) {
  return new Promise(function (F, R) {
    setTimeout(function () {
      if (callback !== undefined) { callback(); }
      R(new Error(msg));
    }, time);
  });
};

if (typeof freedom !== 'undefined') {
  freedom().providePromises(PortControl);
}