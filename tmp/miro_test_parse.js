const fs = require('fs');

const miroJson = {
    "isProtected": false,
    "boardId": "uXjVLUsTenQ=",
    "data": {
        "objects": [
            {
                "widgetData": {
                    "json": {
                        "_position": {
                            "offsetPx": {
                                "x": 12305.831020037906,
                                "y": 1870.0751260911347
                            }
                        },
                        "scale": {
                            "scale": 23.794126350177486
                        },
                        "rotation": {
                            "rotation": 0
                        },
                        "relativeRotation": 0,
                        "size": {
                            "width": 350,
                            "height": 228
                        },
                        "_parent": null,
                        "text": "<p>update todo miro</p>",
                        "style": "{\"fs\":0,\"fsa\":1,\"ffn\":\"OpenSans\",\"ta\":\"c\",\"tav\":\"m\",\"taw\":0,\"tah\":0,\"lh\":1.36,\"sbc\":16765682,\"b\":0,\"i\":0,\"u\":0,\"s\":0}",
                        "ns:author": {
                            "id": "111306861",
                            "enabled": false
                        }
                    },
                    "type": "sticker"
                },
                "type": 14,
                "id": 1,
                "initialId": "3458764651866326627",
                "meta": {
                    "boardId": "uXjVLUsTenQ=",
                    "widgetToken": 3300
                }
            }
        ],
        "meta": {}
    },
    "version": 2,
    "host": "miro.com",
    "asPortalAmount": 0,
    "copierType": "COPY"
};

let extracted = [];
let colorIdx = 0;
const miroColors = ['yellow', 'green', 'blue', 'pink', 'orange', 'purple', 'cyan', 'red', 'white', 'gray', 'dark'];
const exactColorMap = {
    '#f5f6f8': 'gray',
    '#fff9b1': 'yellow',
    '#f5d128': 'yellow',
    '#f09b55': 'orange',
    '#d5f692': 'green',
    '#c9df56': 'green',
    '#93d275': 'green',
    '#68cef8': 'cyan',
    '#fdb8dc': 'pink',
    '#ff73bd': 'pink',
    '#c39ce6': 'purple',
    '#ff6d6d': 'red',
    '#cde3fa': 'blue',
    '#8fd14f': 'green',
    '#568fdb': 'blue',
    '#000000': 'dark',
    '#ffffff': 'white',
    'transparent': 'white'
};

if (miroJson && miroJson.data && miroJson.data.objects) {
    miroJson.data.objects.forEach(obj => {
        if (obj && obj.widgetData && obj.widgetData.json) {
            const jd = obj.widgetData.json;
            const type = (obj.widgetData.type || '').toLowerCase();
            console.log('Found type:', type);

            if (type === 'sticker' || type === 'shape' || type === 'text') {
                let textHTML = jd.text || jd.content || '';
                textHTML = textHTML.replace(/^<p[^>]*>/i, '').replace(/<\/p>$/i, '');

                let startmineType = type === 'text' ? 'text' : 'sticky';

                let bgColorString = 'yellow';
                let exactBgHex = null;

                let styleObj = jd.style;
                if (typeof styleObj === 'string') {
                    try { styleObj = JSON.parse(styleObj); } catch (e) { console.error('style JSON error', e); }
                }

                if (styleObj) {
                    let hex = styleObj.backgroundColor || styleObj.bc;
                    if (!hex && styleObj.sbc) {
                        hex = '#' + parseInt(styleObj.sbc).toString(16).padStart(6, '0');
                    }
                    console.log('Found Hex:', hex);
                    if (hex) {
                        exactBgHex = hex.toLowerCase();
                        if (!exactBgHex.startsWith('#')) exactBgHex = '#' + exactBgHex;
                        bgColorString = exactColorMap[exactBgHex] || 'yellow';
                    }
                }

                if (!exactBgHex) {
                    bgColorString = miroColors[colorIdx % miroColors.length];
                    colorIdx++;
                }

                let cardOpts = {
                    type: startmineType,
                    text: textHTML,
                    color: bgColorString,
                    fontSize: styleObj && styleObj.fs ? parseInt(styleObj.fs) : (styleObj && styleObj.fontSize ? parseInt(styleObj.fontSize) : 24)
                };
                if (exactBgHex) cardOpts.bgHex = exactBgHex;

                if (jd._position && jd._position.offsetPx) {
                    cardOpts._ox = jd._position.offsetPx.x;
                    cardOpts._oy = jd._position.offsetPx.y;
                } else if (jd._position && typeof jd._position.x === 'number') {
                    cardOpts._ox = jd._position.x;
                    cardOpts._oy = jd._position.y;
                }

                if (jd.size) {
                    if (jd.size.width) cardOpts.w = jd.size.width;
                    if (jd.size.height) cardOpts.h = jd.size.height;
                }

                extracted.push(cardOpts);
            }
        }
    });
}

console.log('Extracted Array len:', extracted.length);
console.log(extracted);
