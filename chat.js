const bootstraps = [  ];
const prefix = "demochat-";
var lastAlive = 0;	// last keep-alive we saw from a relay
var lastPeer = 0; 	// last keep-alive we saw from another peer
var lastBootstrap = 0; // used for tracking when we last attempted to bootstrap (likely to reconnect to a relay)
var ipfs;
var peerCount = 0; 	// this is kind of a janky way to track peer count. really it'd be better to store the peers
					// in a map, along with their last "peer-alive", to track peer count in a stable way.

// set this to body's onload function
async function onload() {
	ipfs = await Ipfs.create({
	repo: 'ok' + Math.random(), // random so we get a new peerid every time, useful for testing
	});
}
