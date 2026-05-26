const rawMeta = "tl2kroutqq+gnq+gn111oZynrqBnXZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12fnK+cXXW2XaqdpaCer65ddZa2XbKkn6Kgr3+cr5xddbZdpa6qqV11tl2aq6qupK+kqqlddbZdqqGhrqCvi7NddbZds111a2ddtF11a7i4Z12unpynoF11tl2unpynoF11bG1pcHFycGxxb2xvcW1xcG1wuGddraqvnK+kqqlddbZdraqvnK+kqqlddWu4Z12toKecr6SxoI2qr5yvpKqpXXVrZ12aq5ytoKmvXXWpsKenZ12eraqrXXW2XbNddXNpbmtzdGxzc3Rvb290cWxtZ120XXVtb2l0bXFycHFxc25ub3NzbnBnXbKkn6+jXXVvcHRpa3JubW9ubmxxcXBsbG9nXaOgpKKjr111bmxxaWxrbXBva3Fvbm5sbHFnXa6jnKugXXVdnrCur6qoXbhnXa2grqqwrZ6gXXW2XaSfXXVdbm9wc3Jxb3Bscm9wbnRvc2twbF1nXZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12pnKigXXVdpKicoqBpq6miXWddoqCpoK2cr6CfXXWvrbCgZ12ypJ+vo111b3NvZ12joKSio69ddW5wbLhnXaSonKKgXXW2XZyppKicr6CfXXWhnKeuoGddoLOvoK2pnKeHpKmmXXWpsKenuGddr6Svp6BddV1dZ12cp6+PoLOvXXVdXWddrq+0p6BddV22l12drZ6XXXVobGeXXZ2tqpdddWxnl12drbKXXXVwZ5ddna2ul111bWeXXZ2trZdddWu4XWddraCnnK+ksaCOnpynoF11bG1pcHFycGxxb2xvcW1xcG1wuGddr7SroF11XaSonKKgXbhnXa+0q6BddWxvZ12kn111a2ddpKmkr6Scp4SfXXVdbm9wc3Jxb3Fybm1wcHFra3Bua11nXaigr5xddbZdnaqcrZ+En111XbCTpZGHkK6PoKmMeF1nXbKkn6Kgr4+qpqCpXXVtc29ruLiYZ12ooK+cXXW2uLhnXbGgra6kqqlddW1nXaOqrq9ddV2opK2qaZ6qqF1nXZyui6qtr5ynfKiqsKmvXXVrZ12eqqukoK2PtKugXXVdfoqLlF24";

let b64 = rawMeta.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
while (b64.length % 4) b64 += '=';
const raw = atob(b64);
const firstByte = raw.charCodeAt(0);
const key = (123 - firstByte + 256) % 256;
let decoded = '';
for (let i = 0; i < raw.length; i++) {
  decoded += String.fromCharCode((raw.charCodeAt(i) + key) % 256);
}

const miroJson = JSON.parse(decoded);
console.log(JSON.stringify(miroJson, null, 2));
