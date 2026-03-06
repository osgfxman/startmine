const d = 'tl2kroutqq+gnq+gn111oZynrqBnXZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12fnK+cXXW2XaqdpaCer65ddZa2XbKkn6Kgr3+cr5xddbZdpa6qqV11tl2aq6qupK+kqqlddbZdqqGhrqCvi7NddbZds111bG1ua3Bpc25sa21ra25ydGtxZ120XXVsc3JraWtycGxtcWt0bGxub3K4uGddrp6cp6BddbZdrp6cp6BddW1uaXJ0b2xtcW5wa2xycm9zcbhnXa2qr5yvpKqpXXW2Xa2qr5yvpKqpXXVruGddraCnnK+ksaCNqq+cr6SqqV11a2ddrqS1oF11tl2ypJ+vo111bnBrZ12joKSio69ddW1tc7hnXZqrnK2gqa9ddamwp6dnXa+gs69ddV13q3mwq5+cr6Bbr6qfqluopK2qd2qreV1nXa6vtKegXXVdtpddoa6XXXVrZ5ddoa6cl111bGeXXaGhqZdddZddiqugqY6cqa6XXWeXXa+cl111l12el11nl12vnLGXXXWXXaiXXWeXXa+cspdddWtnl12vnKOXXXVrZ5ddp6OXXXVsaW5xZ5ddrp2el111bHFycXBxc21nl12dl111a2eXXaSXXXVrZ5ddsJdddWtnl12ul111a7hdZ12prnWcsK+jqq1ddbZdpJ9ddV1sbGxua3FzcWxdZ12gqZydp6CfXXWhnKeuoLi4Z12vtKugXXVdrq+knqagrV24Z12vtKugXXVsb2ddpJ9ddWxnXaSppK+knKeEn111XW5vcHNycW9xcGxzcXFubXFxbXJdZ12ooK+cXXW2XZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12ypJ+ioK+PqqagqV11bm5ra7i4mGddqKCvnF11tri4Z12xoK2upKqpXXVtZ12jqq6vXXVdqKStqmmeqqhdZ12crouqra+cp3yoqrCpr111a2ddnqqrpKCtj7SroF11XX6Ki5RduA==';
const b = Buffer.from(d, 'base64');
let j = '';
let key = 100; // Found via shift loop earlier (123 - firstByte + 256) % 256. 
// Let's just find the first byte of b:
key = (123 - b[0] + 256) % 256;
for (let i = 0; i < b.length; i++) {
    j += String.fromCharCode((b[i] + key) % 256);
}
let data = JSON.parse(j);
console.log(JSON.stringify(data, null, 2));
