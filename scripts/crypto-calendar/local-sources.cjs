'use strict';
// Local experiments are deliberately separate from the production registry.
// A later reviewed Lumen Loop adapter can join this list without token-specific UI code.
module.exports=[require('./adapters/ethereum-protocol-calls.cjs'),require('./adapters/stellar-events.cjs')];
