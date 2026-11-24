// Retired compatibility entrypoint. Tool providers must never create node identities.
console.error('Cloud worker provisioning is retired. Start compiler tool providers with START-OMNICOMPILE.bat; create a network and enroll Web, Windows or Android devices in the administrator dashboard. No records were changed.');
process.exitCode=1;
