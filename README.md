# freedom-port-control

Opens ports through a NAT with NAT-PMP, PCP, and UPnP.

## Build

```
npm install
grunt build
```

This will also build a demo Chrome app in `/build/demo_chrome_app`.

## Usage

There are two types of methods: probing and control. Probing methods allow you to determine if a specific protocol is supported, and control methods allow you to open a specific port with a protocol.

### Probing methods

To run all the NAT probing tests,

```
// Probe for all port control protocols support
portControl.probeProtocolSupport();
```

This method resolves to an object of the form `{"natPmp": true, "pcp": false, "upnp": true}`.

You can also probe for a specific protocol:

```
portControl.probePmpSupport();
portControl.probePcpSupport();
portControl.probeUpnpSupport();
```
All of these methods return a promise that will resolve to a boolean value.

### Control methods

To add a NAT port mapping,

```
// Open a port with any protocol available
portControl.addMapping(50000, 50000);
```

This method returns a promise that will resolve to the newly mapped external port number, or `-1` on failure. 

It also automatically refreshes the mapping every two minutes, unless `false` is passed in as the last argument.

You can also add a port mapping with a specific protocol:

```
portControl.openPortWithPmp(55555, 55555);
portControl.openPortWithPcp(55556, 55556);
portControl.openPortWithUpnp(55557, 55557);
```

All of these methods return the same promise as `addMapping`, and refreshes with the default final parameter.

### IP address

The module can also determine the user's private IP addresses (more than one if there are multiple active network interfaces),

```
portControl.getPrivateIps();
```

This returns a promise that will resolve to an array of IP address strings, or reject with an error.
