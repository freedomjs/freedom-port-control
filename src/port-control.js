var ipaddr = require('ipaddr.js');
var utils = require('./utils');
var natPmp = require('./nat-pmp');
var pcp = require('./pcp');
var upnp = require('./upnp');

var PortControl = function (dispatchEvent) {
  this.dispatchEvent = dispatchEvent;
};

/**
* A table that keeps track of information about active Mappings
* The Mapping type is defined in utils.js
* { externalPortNumber1: Mapping1, 
*   externalPortNumber2: Mapping2,
*   ...
* }
*/
PortControl.prototype.activeMappings = {};

/**
* Add a port mapping through the NAT with any protocol that works
* @public
* @method addMapping
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity; handled differently per protocol
* @return {Promise<Mapping>} A promise for the port mapping object
*                            Mapping.externalPort === -1 on failure
**/
PortControl.prototype.addMapping = function (intPort, extPort, lifetime) {
  var _this = this;

  // Try to open a port with NAT-PMP, then PCP, then UPnP in that order
  return _this.addMappingPmp(intPort, extPort, lifetime).
      then(function (mapping) {
        if (mapping.externalPort !== -1) { return mapping; }
        return _this.addMappingPcp(intPort, extPort, lifetime);
      }).
      then(function (mapping) {
        if (mapping.externalPort !== -1) { return mapping; }
        return _this.addMappingUpnp(intPort, extPort, lifetime);
      });
};

/**
* Delete the port mapping locally and from the router, and stop refreshes
* @public
* @method deleteMapping
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
**/
PortControl.prototype.deleteMapping = function (extPort) {
  var _this = this;

  return new Promise(function (F, R) {
    // Get the protocol that this port was mapped with; may error
    var protocol = _this.activeMappings[extPort].protocol;

    if (protocol === 'natPmp') {
      F(_this.deleteMappingPmp(extPort));
    } else if (protocol === 'pcp') {
      F(_this.deleteMappingPcp(extPort));
    } else if (protocol === 'upnp') {
      F(_this.deleteMappingUpnp(extPort));
    }
  }).catch(function (err) {
    return false;
  });
};

/**
* Probes the NAT for NAT-PMP, PCP, and UPnP support,
* and returns an object representing the NAT configuration
* Don't run probe before trying to map a port; instead, just try to map the port
* @public
* @method probeProtocolSupport
* @return {Promise<{"natPmp": boolean, "pcp": boolean, "upnp": boolean}>}
*/
PortControl.prototype.probeProtocolSupport = function () {
  return Promise.all([this.probePmpSupport(), this.probePcpSupport(),
    this.probeUpnpSupport()]).then(function (support) {
      var protocolSupport = {
        natPmp: support[0],
        pcp: support[1],
        upnp: support[2]
      };
      return protocolSupport;
    });
};

/**
* Probe if NAT-PMP is supported by the router
* @public
* @method probePmpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probePmpSupport = function () {
  return natPmp.probePmpSupport(this.activeMappings);
};

/**
* Makes a port mapping in the NAT with NAT-PMP,
* and automatically refresh the mapping every two minutes
* @public
* @method addMappingPmp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity, i.e. a refresh every 24 hours
* @return {Promise<Mapping>} A promise for the port mapping object
*                            Mapping.externalPort === -1 on failure
*/
PortControl.prototype.addMappingPmp = function (intPort, extPort, lifetime) {
  return natPmp.addMappingPmp(intPort, extPort, lifetime, this.activeMappings);
};

/**
* Deletes a port mapping in the NAT with NAT-PMP
* @public
* @method deleteMappingPmp
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
*/
PortControl.prototype.deleteMappingPmp = function (extPort) {
  return natPmp.deleteMappingPmp(extPort, this.activeMappings);
};

/**
* Probe if PCP is supported by the router
* @public
* @method probePcpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probePcpSupport = function () {
  return pcp.probePcpSupport(this.activeMappings);
};

/**
* Makes a port mapping in the NAT with PCP,
* and automatically refresh the mapping every two minutes
* @public
* @method addMappingPcp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity, i.e. a refresh every 24 hours
* @return {Promise<Mapping>} A promise for the port mapping object 
*                            mapping.externalPort is -1 on failure
*/
PortControl.prototype.addMappingPcp = function (intPort, extPort, lifetime) {
  return pcp.addMappingPcp(intPort, extPort, lifetime, this.activeMappings);
};

/**
* Deletes a port mapping in the NAT with PCP
* @public
* @method deleteMappingPcp
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
*/
PortControl.prototype.deleteMappingPcp = function (extPort) {
  return pcp.deleteMappingPcp(extPort, this.activeMappings);
};

/**
* Probe if UPnP AddPortMapping is supported by the router
* @public
* @method probeUpnpSupport
* @return {Promise<boolean>} A promise for a boolean
*/
PortControl.prototype.probeUpnpSupport = function () {
  return upnp.probeUpnpSupport(this.activeMappings);
};

/**
* Makes a port mapping in the NAT with UPnP AddPortMapping
* @public
* @method addMappingUpnp
* @param {number} intPort The internal port on the computer to map to
* @param {number} extPort The external port on the router to map to
* @param {number} lifetime Seconds that the mapping will last
*                          0 is infinity; a static AddPortMapping request
* @return {Promise<Mapping>} A promise for the port mapping object 
*                               mapping.externalPort is -1 on failure
*/
PortControl.prototype.addMappingUpnp = function (intPort, extPort, lifetime) {
  return upnp.addMappingUpnp(intPort, extPort, lifetime, this.activeMappings);
};

/**
* Deletes a port mapping in the NAT with UPnP DeletePortMapping
* @public
* @method deleteMappingUpnp
* @param {number} extPort The external port of the mapping to delete
* @return {Promise<boolean>} True on success, false on failure
*/
PortControl.prototype.deleteMappingUpnp = function (extPort) {
  return upnp.deleteMappingUpnp(extPort, this.activeMappings);
};

/**
* Returns the current value of activeMappings
* @public
* @method getActiveMappings
* @return {Promise<activeMappings>} A promise that resolves to activeMappings
*/
PortControl.prototype.getActiveMappings = function () {
  return Promise.resolve(this.activeMappings);
};

/**
* Return the private IP addresses of the computer
* @public
* @method getPrivateIps
* @return {Promise<string>} A promise that fulfills with a list of IP address, 
*                           or rejects on timeout
*/
PortControl.prototype.getPrivateIps = function () {
  return utils.getPrivateIps();
};

/**
* Deletes all the currently active port mappings
* @public
* @method close
*/
PortControl.prototype.close = function () {
  var _this = this;

  return new Promise(function (F, R) {
    // Get all the keys (extPorts) of activeMappings
    var extPorts = [];
    for (var extPort in _this.activeMappings) {
      if (_this.activeMappings.hasOwnProperty(extPort)) {
        extPorts.push(extPort);
      }
    }

    // Delete them all
    Promise.all(extPorts.map(_this.deleteMapping.bind(_this))).then(function () {
      F();
    });
  });
};

if (typeof freedom !== 'undefined') {
  freedom().providePromises(PortControl);
}
