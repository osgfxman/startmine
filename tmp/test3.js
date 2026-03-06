const zlib = require('zlib');

const rawMeta = "<--(miro-data-v1)2Xa6enKegXXVtbmlyc3Rza290a3F0cHRrbm+4Z12tqq+cr6SqqV11tl2tqq+cr6SqqV11a7hnXa2gp5yvpLGgjaqvnK+kqqlddWtnXa6ktaBddbZdsqSfr6NddW5wa2ddo6CkoqOvXXVtbXO4Z12aq5ytoKmvXXWpsKenZ12voLOvXXVdd6t5FMAT8BPqE+xbE+oT6RS/WxPuE+wUxRP0d2qreV1nXa6vtKegXXVdtpddoa6XXXVrZ5ddoa6cl111bGeXXaGhqZdddZddiqugqY6cqa6XXWeXXa+cl111l12el11nl12vnLGXXXWXXaiXXWeXXa+cspdddWtnl12vnKOXXXVrZ5ddp6OXXXVsaW5xZ5ddrp2el111bHFycG1tc3G4XWddqa51nLCvo6qtXXW2XaSfXXVdbGxsbmtxc3FsXWddoKmcnaegn111oZynrqC4uGddr7SroF11Xa6vpJ6moK1duGddr7SroF11bG9nXaSfXXVsZ12kqaSvpJynhJ9ddV1ub3BzcnFvcW9xa2xudG9zc21vXWddqKCvnF11tl2dqpytn4SfXXVdsJOlkYeQro+gqYx4XWddsqSfoqCvj6qmoKlddW5scG24uGe2XbKkn6Kgr3+cr5xddbZdpa6qqV11tl2aq6qupK+kqqlddbZdqqGhrqCvi7NddbZds111bHFua3FpdHNxbWxucnRtbm9zZ120XXVsbW9pc290cG5wdG1rbHRscHG4uGddrp6cp6BddbZdrp6cp6BddW1uaXJ0b2xtcW5wa2xycm9zcbhnXa2qr5yvpKqpXXW2Xa2qr5yvpKqpXXVruGddraCnnK+ksaCNqq+cr6SqqV11a2ddrqS1oF11tl2ypJ+vo111bnBrZ12joKSio69ddW1tc7hnXZqrnK2gqa9ddamwp6dnXa+gs69ddV13q3mwq5+cr6Bbr6qfqluopK2qd2qreV1nXa6vtKegXXVdtpddoa6XXXVrZ5ddoa6cl111bGeXXaGhqZdddZddiqugqY6cqa6XXWeXXa+cl111l12el11nl12vnLGXXXWXXaiXXWeXXa+cspdddWtnl12vnKOXXXVrZ5ddp6OXXXVsaW5xZ5ddrp2el111bHFycXBxc21nl12dl111a2eXXaSXXXVrZ5ddsJdddWtnl12ul111a7hdZ12prnWcsK+jqq1ddbZdpJ9ddV1sbGxua3FzcWxdZ12gqZydp6CfXXWhnKeuoLi4Z12vtKugXXVdrq+knqagrV24Z12vtKugXXVsb2ddpJ9ddW1nXaSppK+knKeEn111XW5vcHNycW9xb3RzbW1zdGxtc2tdZ12ooK+cXXW2XZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12ypJ+ioK+PqqagqV11bmxwbri4Z7ZdsqSfoqCvf5yvnF11tl2lrqqpXXW2XZqrqq6kr6SqqV11tl2qoaGuoK+Ls111tl2zXXVocmtubGlzbWxybGtybHNtb25nXbRddWhsc3FyaXFwbm5wb3NvcGtrdHK4uGddrp6cp6BddbZdrp6cp6BddW1uaWxsbHBybnJvc25zcGtub7hnXa2qr5yvpKqpXXW2Xa2qr5yvpKqpXXVruGddraCnnK+ksaCNqq+cr6SqqV11a2ddrqS1oF11tl2ypJ+vo111bnBrZ12joKSio69ddW1tc7hnXZqrnK2gqa9ddamwp6dnXa+gs69ddV13q3l9p7Cgq62kqa9bqaqfoK5boLOrp5ykqaCfW6KgqKSppHdqq3ldZ12ur7SnoF11XbaXXaGul111a2eXXaGunJdddWxnl12hoamXXXWXXYqroKmOnKmul11nl12vnJdddZddnpddZ5ddr5yxl111l12ol11nl12vnLKXXXVrZ5ddr5yjl111a2eXXaejl111bGlucWeXXa6dnpdddWxxcnJwcWtsuF1nXamudZywr6OqrV11tl2kn111XWxsbG5rcXNxbF1nXaCpnJ2noJ9ddaGcp66guLhnXa+0q6BddV2ur6SepqCtXbhnXa+0q6BddWxvZ12kn111bmddpKmkr6Scp4SfXXVdbm9wc3Jxb3FsbXN0cmttb2xwdF1nXaigr5xddbZdnaqcrZ+En111XbCTpZGHkK6PoKmMeF1nXbKkn6Kgr4+qpqCpXXVubHFuuLhntl2ypJ+ioK9/nK+cXXW2XaWuqqlddbZdmquqrqSvpKqpXXW2Xaqhoa6gr4uzXXW2XbNddWhscHNrbmlxb29udG1ycHFxZ120XXVtb29xaWttc25xbXR0bm5zb7i4Z12unpynoF11tl2unpynoF11bWtpdGt0bW9vb3NxbnRubm5yuGddraqvnK+kqqlddbZdraqvnK+kqqlddWu4Z12toKecr6SxoI2qr5yvpKqpXXVrZ12upLWgXXW2XbKkn6+jXXVucGtnXaOgpKKjr111bW1zuGddmqucraCpr111qbCnp2ddr6Czr111XXereRPvE/UUvxTEWxPiFL8UvhTAE+MUxRTDE+UT7FsUwxPpE+pbE+oT4hPlE+J3aqt5XWddrq+0p6BddV22l12hrpdddWtnl12hrpyXXXVsZ5ddoaGpl111l12Kq6CpjpyprpddZ5ddr5yXXXWXXZ6XXWeXXa+csZdddZddqJddZ5ddr5yyl111a2eXXa+co5dddWtnl12no5dddWxpbnFnl12unZ6XXXVscXFta21xbrhdZ12prnWcsK+jqq1ddbZdpJ9ddV1sbGxua3FzcWxdZ12gqZydp6CfXXWhnKeuoLi4Z12vtKugXXVdrq+knqagrV24Z12vtKugXXVsb2ddpJ9ddW9nXaSppK+knKeEn111XW5vcHNycW9xcGtra3Rrc2txb2xdZ12ooK+cXXW2XZ2qnK2fhJ9ddV2wk6WRh5Cuj6CpjHhdZ12ypJ+ioK+PqqagqV11bm1xcri4Z7ZdsqSfoqCvf5yvnF11tl2lrqqpXXW2XZqrqq6kr6SqqV11tl2qoaGuoK+Ls111tl2zXXVtbW9vaXFycHNrcXBua2xxdGddtF11aG1za3Jpc25zbHR0cnF0cWxtb7i4Z12unpynoF11tl2unpynoF11bW5pcnRvbG1xbnBrbHJycHG4Z12tqq+cr6SqqV11tl2tqq+cr6SqqV11a7hnXa2gp5yvpLGgjaqvnK+kqqlddWtnXa6ktaBddbZdsqSfr6NddW5wa2ddo6CkoqOvXXVtbXO4Z12aq5ytoKmvXXWpsKenZ12voLOvXXVdd6t5FL4T5RPiE+NbE+IUvxPiE+4T4xTDE+RbFLwUwVsT4hS/FL8T4hTAE+MT4hS/E+IUwv3bd2qreV1nXa6vtKegXXVdtpddoa6XXXVrZ5ddoa6cl111bGeXXaGhqZdddZddiqugqY6cqa6XXWeXXa+cl111l12el11nl12vnLGXXXWXXaiXXWeXXa+cspdddWtnl12vnKOXXXVrZ5ddp6OXXXVsaW5xZ5ddrp2el111bHFycnBrcmu4XWddqa51nLCvo6qtXXW2XaSfXXVdbGxsbmtxc3FsXWddoKmcnaegn111oZynrqC4uGddr7SroF11Xa6vpJ6moK1duGddr7SroF11bG9nXaSfXXVwZ12kqaSvpJynhJ9ddV1ub3BzcnFvcXBsc3Fxbm1xcW1yXWddqKCvnF11tl2dqpytn4SfXXVdsJOlkYeQro+gqYx4XWddsqSfoqCvj6qmoKlddW5ua2u4uGe2XbKkn6Kgr3+cr5xddbZdpa6qqV11tl2aq6qupK+kqqlddbZdqqGhrqCvi7NddbZds111cmxraWtub3NscHB0dHRxcm5nXbRddW5rc21pc3RzcmtvbGxxcXRzb7i4Z12unpynoF11tl2unpynoF11bWxpbnNsbmxvdGtzcG5ybW24Z12tqq+cr6SqqV11tl2tqq+cr6SqqV11a7hnXa2gp5yvpLGgjaqvnK+kqqlddWtnXa6ktaBddbZdsqSfr6NddWx0dGddo6CkoqOvXXVtbXO4Z12aq5ytoKmvXXWpsKenZ12voLOvXXVdd6t5g6Ccra+0W5yrq3dqq3ldZ12ur7SnoF11XbaXXaGul111a2eXXaGunJdddWxnl12hoamXXXWXXYqroKmOnKmul11nl12vnJdddZddnpddZ5ddr5yxl111l12ol11nl12vnLKXXXVrZ5ddr5yjl111a2eXXaejl111bGlucWeXXa6dnpdddWxrbXNtcnBsuF1nXamudZywr6OqrV11tl2kn111XWxsbG5rcXNxbF1nXaCpnJ2noJ9ddaGcp66guLhnXa+0q6BddV2ur6SepqCtXbhnXa+0q6BddWxvZ12kn111cWddpKmkr6Scp4SfXXVdbm9wc3Jxb3FwbmxvcWxxa29ua11nXaigr5xddbZdnaqcrZ+En111XbCTpZGHkK6PoKmMeF1nXbKkn6Kgr4+qpqCpXXVubmxuuLiYZ12ooK+cXXW2uLhnXbGgra6kqqlddW1nXaOqrq9ddV2opK2qaZ6qqF1nXZyui6qtr5ynfKiqsKmvXXVrZ12eqqukoK2PtKugXXVdfoqLlF24(/miro-data-v1)-->";

const match = rawMeta.match(/<--\(miro-data-v1\)([\s\S]*?)\(\/miro-data-v1\)-->/);
if (match && match[1]) {
    const rawBase64 = match[1].replace(/\s/g, '');
    const buffer = Buffer.from(rawBase64, 'base64');

    // Test if it's zlib deflated directly without caesar shift first
    zlib.inflateRaw(buffer, (err, deflated) => {
        if (!err) console.log("INFLATE RAW:", deflated.toString('utf-8').substring(0, 100));
        else console.log("INFLATE RAW ERR");
    });

    zlib.inflate(buffer, (err, deflated) => {
        if (!err) console.log("INFLATE:", deflated.toString('utf-8').substring(0, 100));
        else console.log("INFLATE ERR");
    });

    zlib.unzip(buffer, (err, deflated) => {
        if (!err) console.log("UNZIP:", deflated.toString('utf-8').substring(0, 100));
        else console.log("UNZIP ERR");
    });

    // Apply strict caesar cipher (offset -89 seems to be common from my past experience but we can just loop 1-255 again but try deflating afterwards)
    for (let offset = 0; offset < 256; offset++) {
        let decodedBuf = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            decodedBuf[i] = (buffer[i] + offset) % 256;
        }

        zlib.inflateRaw(decodedBuf, (err, deflated) => {
            if (!err) {
                console.log(`BINGO INFLATE RAW CAESAR ${offset}:`, deflated.toString('utf-8').substring(0, 100));
                try { JSON.parse(deflated.toString('utf-8')); console.log("VALID JSON") } catch (e) { }
            }
        });
        zlib.inflate(decodedBuf, (err, deflated) => {
            if (!err) {
                console.log(`BINGO INFLATE CAESAR ${offset}:`, deflated.toString('utf-8').substring(0, 100));
                try { JSON.parse(deflated.toString('utf-8')); console.log("VALID JSON") } catch (e) { }
            }
        });
    }

    // Try Subtractive Caesar
    for (let offset = 0; offset < 256; offset++) {
        let decodedBuf = Buffer.alloc(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
            decodedBuf[i] = (buffer[i] - offset + 256) % 256;
        }

        zlib.inflateRaw(decodedBuf, (err, deflated) => {
            if (!err) {
                console.log(`BINGO INFLATE RAW SUB ${offset}:`, deflated.toString('utf-8').substring(0, 100));
                try { JSON.parse(deflated.toString('utf-8')); console.log("VALID JSON") } catch (e) { }
            }
        });
        zlib.inflate(decodedBuf, (err, deflated) => {
            if (!err) {
                console.log(`BINGO INFLATE SUB ${offset}:`, deflated.toString('utf-8').substring(0, 100));
                try { JSON.parse(deflated.toString('utf-8')); console.log("VALID JSON") } catch (e) { }
            }
        });
    }

}
