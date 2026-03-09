import puppeteer from 'puppeteer';

(async () => {
    try {
        const browser = await puppeteer.launch();
        const page = await browser.newPage();

        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
        page.on('response', response => {
            if (!response.ok()) {
                console.log('NETWORK ERROR:', response.url(), response.status());
            }
        });

        await page.goto('http://localhost:5173');
        await new Promise(r => setTimeout(r, 2000));

        await page.type('#player-name-input', 'Test');
        await page.type('#room-name-input', 'Room');
        await page.click('#join-btn');

        await new Promise(r => setTimeout(r, 2000));
        await browser.close();
    } catch (e) {
        console.error("Puppeteer Script Error:", e);
        process.exit(1);
    }
})();
