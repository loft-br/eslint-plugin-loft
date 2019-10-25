'use strict';

function error(message) {
  if (!/=-(f|-format)=/.test(process.argv.join('='))) {
    console.error(message);
  }
}

module.exports = error;
