// Decode the text-only Miro clipboard data to see its JSON structure
const rawMeta = "<--(miro-data-v1)tl2kroutqq+gnq+gn111oZynrqBnXZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12fnK+cXXW2XaqdpaCer65ddZa2XbKkn6Kgr3+cr5xddbZdpa6qqV11tl2aq6qupK+kqqlddbZdqqGhrqCvi7NddbZds111a2ddtF11a7i4Z12unpynoF11tl2unpynoF11bXJzaXR0b3NzbnJzbHRsbG64Z12toKecr6SxoI6enKegXXVtcnNpdHRvc3NucnNsdGxsbmddraqvnK+kqqlddbZdraqvnK+kqqlddWu4Z12toKecr6SxoI2qr5yvpKqpXXVrZ12upLWgXXW2XbKkn6+jXXVub2ddo6CkoqOvXXVta7hnXZqrnK2gqa9ddamwp6dnXa+gs69ddV13q3mvoK6vbFt3aqt5XWddrq+0p6BddV22l12ur5dddWxvZ5ddnZ6XXXVobGeXXZ2ql111bGeXXZ2unpdddWtnl12vnJdddZddp5ddZ5ddr56XXXVscmxrcWxzZ5ddr66el111bGeXXaGhqZdddZddiaqvqluOnKmul11nl12rl111a2eXXZ2XXXVrZ5ddsJdddWtnl12kl111a2eXXa6XXXVrZ5ddobKXXXVrZ5ddna2el111aGxnl12draqXXXVsZ5ddna2yl111a2eXXZ2trpdddW1nl12jp5dddWu4XbhnXa+0q6BddV2voLOvXbhnXa+0q6BddWxvZ12kn111a2ddpKmkr6Scp4SfXXVdbm9wc3Jxb3FxbXFua3JzcXBzc11nXaigr5xddbZdnaqcrZ+En111XbCTpZGHkK6PoKmMeF1nXbKkn6Kgr4+qpqCpXXVub3FuuLiYZ12ooK+cXXW2uLhnXbGgra6kqqlddW1nXaOqrq9ddV2opK2qaZ6qqF1nXZyui6qtr5ynfKiqsKmvXXVrZ12eqqukoK2PtKugXXVdfoqLlF24(/miro-data-v1)-->";

const match = rawMeta.match(/<--\(miro-data-v1\)([\s\S]*?)\(\/miro-data-v1\)-->/);
let b64 = match[1].replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/');
while (b64.length % 4) b64 += '=';
const raw = Buffer.from(b64, 'base64').toString('binary');
const firstByte = raw.charCodeAt(0);
const key = (123 - firstByte + 256) % 256;
const bytes = [];
for (let i = 0; i < raw.length; i++) bytes.push((raw.charCodeAt(i) + key) % 256);
const decoded = Buffer.from(bytes).toString('utf8');

try {
    const json = JSON.parse(decoded);
    json.data.objects.forEach((obj, i) => {
        const type = obj.widgetData?.type;
        const jd = obj.widgetData?.json;
        console.log(`\n=== Object ${i}: type="${type}" ===`);
        if (jd) {
            console.log('Position:', JSON.stringify(jd._position));
            console.log('Scale:', JSON.stringify(jd.scale));
            console.log('Size:', JSON.stringify(jd.size));
            console.log('All keys:', Object.keys(jd).join(', '));
        }
    });
} catch (e) {
    console.error('Parse error:', e.message);
    console.log('Decoded (first 2000):', decoded.substring(0, 2000));
}
