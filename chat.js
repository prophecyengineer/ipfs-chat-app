//node gives us the ability to use circuit relay 
const bootstraps = ['/dns6/ipfs.thedisco.zone/tcp/4430/wss/p2p/12D3KooWChhhfGdB9GJy1GbhghAAKCUR99oCymMEVS4eUcEy67nt', '/dns4/ipfs.thedisco.zone/tcp/4430/wss/p2p/12D3KooWChhhfGdB9GJy1GbhghAAKCUR99oCymMEVS4eUcEy67nt'];
const prefix = "demochat-";
var lastAlive = 0;	// last keep-alive we saw from a relay
var lastPeer = 0; 	// last keep-alive we saw from another peer
var lastBootstrap = 0; // used for tracking when we last attempted to bootstrap (likely to reconnect to a relay)
var ipfs;
var peerCount = 0; 	// this is kind of a janky way to track peer count. really it'd be better to store the peers
					// in a map, along with their last "peer-alive", to track peer count in a stable way.



// usage: await joinchan("example_channel");
async function joinchan(chan) {
	await ipfs.pubsub.subscribe(prefix+chan, out);
} 

// usage: await sendmsg("Hello", "example_channel");
async function sendmsg(msg, chan) {
	await ipfs.pubsub.publish(prefix+chan, msg);
}

// used for triggering a sendmsg from user input
async function sendMsg() {
	displayn = document.getElementById("displayInput").value;
	msg = document.getElementById("chatInput").value;
	if (displayn == "" || msg == "") {
		return true;
	}
	sendmsg("["+displayn+"] " + msg, "global");
	document.getElementById("chatInput").value = "";
}

// out is used for processing recieved messages and outputting them both to console and the message box.
function out(msg) {
	msg = new TextDecoder().decode(msg.data);
	console.log(msg);
	c = document.getElementById("chat");
	c.innerHTML += "<br>"+msg.replace(/</g, "&lt;").replace(/>/g, "&gt;");
	c.scrollTop = c.scrollHeight;
}



//this function connects to our bootstraps nodes 
//if reconnect is true it initally disconnects from the bootstraps 
//manually disconnecting first like this avoids issue if it fails


async function dobootstrap(reconnect) {
	now = new Date().getTime();
	if (now - lastBootstrap < 60000) {
		return; 
	}
	lastBootstrap = now;
	for (i in bootstraps) {
		if (reconnect) {
			try {
				await ipfs.swarm.disconnect(bootstraps[i]);
			} catch (e) {
				console.log(e);
			}
		} else {
			await ipfs.bootstrap.add(bootstraps[i]);
		}
		await ipfs.swarm.connect(bootstraps[i]);
	}
}




// processes a circuit-relay announce over pubsub
async function processAnnounce(addr) {
	// get our peerid
	me = await ipfs.id();
	me = me.id;
	
	// not really an announcement if it's from us
	if (addr.from == me) {
		return;
	}
	
	// process the recieved address
	addr = new TextDecoder().decode(addr.data);
	
	if (addr == "peer-alive") {
		console.log(addr);
		pcDisplay = document.getElementById("peerCount");
		peerCount += 1;
		pcDisplay.innerHTML = peerCount.toString();
		setTimeout(function(){
			peerCount -= 1;
			pcDisplay.innerHTML = peerCount.toString();
		}, 15000);
		
		lastPeer = new Date().getTime();
		return;
	}
	
	// keep-alives are also sent over here, so let's update that global first
	lastAlive = new Date().getTime();
	
	
	if (addr == "keep-alive") {
		console.log(addr);
		return;
	} 
	peer = addr.split("/")[9];
	console.log("Peer: " + peer);
	console.log("Me: " + me);
	if (peer == me) {
		return;
	}
	
	// get a list of peers
	peers = await ipfs.swarm.peers();
	for (i in peers) {
		// if we're already connected to the peer, don't bother doing a circuit connection
		if (peers[i].peer == peer) {
			return;
		}
	}
	// log the address to console as we're about to attempt a connection
	console.log(addr);
	
	// connection almost always fails the first time, but almost always succeeds the second time, so we do this:
	try {
		await ipfs.swarm.connect(addr);
	} catch(err) {
		console.log(err);
		await ipfs.swarm.connect(addr);
	}
}

// check if we're still connected to the circuit relay (not required, but let's us know if we can see peers who may be stuck behind NAT)
function checkalive() {
	now = new Date().getTime();
	if (now-lastAlive >= 35000) {
		if (now-lastPeer >= 35000) {
			document.getElementById("status-ball").style.color = "red";
		} else {
			document.getElementById("status-ball").style.color = "yellow";
		}
		dobootstrap(true); // sometimes we appear to be connected to the bootstrap nodes, but we're not, so let's try to reconnect
	} else {
		document.getElementById("status-ball").style.color = "lime";
	}
}

async function onload() {
	ipfs = await Ipfs.create({
		repo: 'ok' + Math.random(), // random so we get a new peerid every time, useful for testing
		relay: {
			enabled: true,
			hop: {
				enabled: true
			}
		},
		config: {
			Addresses: {
				Swarm: [ '/dns4/star.thedisco.zone/tcp/9090/wss/p2p-webrtc-star', '/dns6/star.thedisco.zone/tcp/9090/wss/p2p-webrtc-star' ]
			},
		}});
	// add bootstraps for next time, and attempt connection just in case we're not already connected
	await dobootstrap(false);

	// join a global channel, because we don't have real chat channels implemented yet
	joinchan("global");

	// check when we last saw certain keep-alives to update the status ball with
	setInterval(checkalive, 1000);

	// process announcements over the relay network, and publish our own keep-alives to keep the channel alive
	await ipfs.pubsub.subscribe("announce-circuit", processAnnounce);
	setInterval(function () { ipfs.pubsub.publish("announce-circuit", "peer-alive"); }, 15000);
	
	// block for translating an enter keypress while in the chat input as a message submission
	document.getElementById("chatInput").addEventListener("keydown", async function(e) {
		if (!e) { var e = window.event; }
		
		// Enter is pressed
		if (e.keyCode == 13) { 
			e.preventDefault();
			await sendMsg();
		}
	}, false);
}