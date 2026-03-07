const rawMeta = "<--(miro-data-v1)tl2kroutqq+gnq+gn111oZynrqBnXZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12fnK+cXXW2XaqdpaCer65ddZa2XbKkn6Kgr3+cr5xddbZdpa6qqV11tl2rqqSpr65ddZaYZ12rraSonK20XXW2XauqpKmvXXW2XbNddXFzb2xpbWxtcGxwc3Bva3JuZ120XXVsa3FzaW9sdHRvcXBubHBubW64Z12rqq6kr6SqqY+0q6BddWtnXbKkn6Kgr4Spn6CzXXVobLhnXa6gnqqpn5yttF11tl2rqqSpr111tl2zXXVxdHNsaW9rcHFwdG50bXFtbWddtF11bGtxc2lvbHR0b3Fwbmxwbm1uuGddq6qupK+kqqmPtKugXXVrZ12ypJ+ioK+EqZ+gs111aGy4Z12aq6qupK+kqqlddamwp6dnXZqrnK2gqa9ddamwp6dnXa6vtKegXXVdtpddp56XXXVubnBwb29uZ5ddp66XXXVtZ5ddr5dddW1nl12nr5dddWtnl12cmq6vnK2vl111a2eXXZyaoKmfl111dGeXXZGAjZdddW1nl12lsKirl111a7hdZ12npKmgXXW2XZ6cq6+kqqmuXXWWmLi4Z12vtKugXXVdp6SpoF24Z12vtKugXXVsb2ddpJ9ddWtnXaSppK+knKeEn111XW5vcHNycW9xb3Rya2xydHBzdGxdZ12ooK+cXXW2XZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12ypJ+ioK+PqqagqV11bmxucbi4Z7ZdsqSfoqCvf5yvnF11tl2lrqqpXXW2XZqrqq6kr6SqqV11tl2qoaGuoK+Ls111tl2zXXVobHFua3Jpcm9tb3FxbnBwcHNyZ120XXVobHNxcmlxcG5ucG9zb3Btb21xuLhnXa6enKegXXW2Xa6enKegXXVtbmlyc3Rza290a3F0cHRrbm+4Z12tqq+cr6SqqV11tl2tqq+cr6SqqV11a7hnXa2gp5yvpLGgjaqvnK+kqqlddWtnXa6ktaBddbZdsqSfr6NddW5wa2ddo6CkoqOvXXVtbXO4Z12aq5ytoKmvXXWpsKenZ12voLOvXXVdd6t5FMAT8BPqE+xbE+oT6RS/WxPuE+wUxRP0d2qreV1nXa6vtKegXXVdtpddoa6XXXVrZ5ddoa6cl111bGeXXaGhqZdddZddiqugqY6cqa6XXWeXXa+cl111l12el11nl12vnLGXXXWXXaiXXWeXXa+cspdddWtnl12vnKOXXXVrZ5ddp6OXXXVsaW5xZ5ddrp2el111bHFycG1tc3G4XWddqa51nLCvo6qtXXW2XaSfXXVdbGxsbmtxc3FsXWddoKmcnaegn111oZynrqC4uGddr7SroF11Xa6vpJ6moK1duGddr7SroF11bG9nXaSfXXVuZ12kqaSvpJynhJ9ddV1ub3BzcnFvcW50cnFua11nXaigr5xddba4uGddoKmcnaegn111oZynrqC4uGddsaCtrqSqqV11bWddo6qur111XaikrappnqqoXWddnK6Lqq2vnKd8qKqwqa9ddWtnXZ6qq6SgrY+0q6BddV1+iouUXbg=(/miro-data-v1)-->";

const match = rawMeta.match(/<--\(miro-data-v1\)([\s\S]*?)\(\/miro-data-v1\)-->/);
if (!match) { console.log('No miro data found'); process.exit(1); }

let b64 = match[1].replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
while (b64.length % 4) b64 += '=';
const raw = Buffer.from(b64, 'base64').toString('binary');
const firstByte = raw.charCodeAt(0);
const key = (123 - firstByte + 256) % 256;
let decoded = '';
for (let i = 0; i < raw.length; i++) {
    decoded += String.fromCharCode((raw.charCodeAt(i) + key) % 256);
}

const miroJson = JSON.parse(decoded);
console.log(JSON.stringify(miroJson, null, 2));
