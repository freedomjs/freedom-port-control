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

To use the probing methods,

```
// Probe for NAT-PMP support
portControl.probePmpSupport();
// Probe for PCP support
portControl.probePcpSupport();
// Probe for UPnP support
portControl.probeUpnpSupport();
```
All of these methods return a promise that will resolve to a boolean value.

To use the control methods,

```
// Open a port with NAT-PMP
portControl.openPortWithPmp(55555, 55555);
// Open a port with PCP
portControl.openPortWithPcp(55556, 55556);
// Open a port with UPnP
portControl.openPortWithUpnp(55557, 55557);
```

All of these methods return a promise that will resolve to the newly mapped external port number, or `-1` on failure. 

The module can also determine the user's private IP address,

```
portControl.getPrivateIp();
```
