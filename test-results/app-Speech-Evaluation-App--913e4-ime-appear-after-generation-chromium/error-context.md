# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> Speech Evaluation App >> should verify pause button and audio time appear after generation
- Location: tests/app.spec.ts:127:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button').filter({ has: locator('svg.lucide-pause') })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button').filter({ has: locator('svg.lucide-pause') })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - banner [ref=e5]:
    - generic [ref=e6]:
      - heading "LingoCoach AI" [level=1] [ref=e7]
      - paragraph [ref=e8]: Master your English pronunciation and fluency with expert AI feedback.
    - generic [ref=e9]:
      - button "Sign In to Save History" [ref=e10]:
        - img
        - text: Sign In to Save History
      - generic [ref=e11]: Powered by Gemini 3 Flash
  - generic [ref=e12]:
    - tablist [ref=e13]:
      - tab "Practice Studio" [ref=e14]
      - tab "Input Transcript" [selected] [ref=e15]:
        - img
        - text: Input Transcript
      - tab "History" [ref=e16]:
        - img
        - text: History
    - tabpanel "Input Transcript" [ref=e17]:
      - generic [ref=e18]:
        - generic [ref=e19]:
          - generic [ref=e20]:
            - generic [ref=e21]:
              - img [ref=e22]
              - text: Text-to-Voice Studio
            - generic [ref=e24]: Paste any English text below and hear how it should be pronounced naturally.
          - generic [ref=e26]:
            - textbox "Paste your transcript here (e.g., 'Hello, how are you today? I hope you are having a wonderful time learning English.')" [ref=e27]: Testing audio playback and pause button.
            - generic [ref=e28]: 40 characters
          - generic [ref=e29]:
            - button "Generate & Play" [ref=e31]:
              - img
              - text: Generate & Play
            - generic [ref=e32]:
              - img [ref=e33]
              - text: "Total Audio Time: 0.0s"
        - generic [ref=e36]:
          - generic [ref=e37]:
            - img [ref=e39]
            - generic [ref=e42]: Natural Intonation
          - generic [ref=e43]:
            - img [ref=e45]
            - generic [ref=e48]: Clear Pronunciation
          - generic [ref=e49]:
            - img [ref=e51]
            - generic [ref=e54]: Perfect Rhythm
```

# Test source

```ts
  98  |     // This is tricky without a real recording. 
  99  |     // Let's instead mock the state directly if we can, or just assert on the UI elements
  100 |     // that would appear.
  101 |     
  102 |     // For now, let's just add more UI checks to increase coverage
  103 |     await expect(page.getByText('LingoCoach AI')).toBeVisible();
  104 |   });
  105 | 
  106 |   test('should verify the presence of all feedback tabs', async ({ page }) => {
  107 |     // We can check if the tabs exist in the DOM even if not visible/active
  108 |     // Actually they are only rendered when result is truthy.
  109 |     // So we need a result.
  110 |     await expect(page.getByText('Practice Studio')).toBeVisible();
  111 |   });
  112 | 
  113 |   test('should navigate to Input Transcript tab and check elements', async ({ page }) => {
  114 |     const inputTab = page.getByRole('tab', { name: /Input Transcript/i });
  115 |     await inputTab.click();
  116 |     
  117 |     await expect(page.getByText('Text-to-Voice Studio')).toBeVisible();
  118 |     await expect(page.getByPlaceholder(/Paste your transcript here/i)).toBeVisible();
  119 |     await expect(page.getByRole('button', { name: /Generate & Play/i, exact: true })).toBeVisible();
  120 |     
  121 |     // Test typing in textarea
  122 |     const textarea = page.getByPlaceholder(/Paste your transcript here/i);
  123 |     await textarea.fill('Hello world');
  124 |     await expect(page.getByText('11 characters')).toBeVisible();
  125 |   });
  126 | 
  127 |   test('should verify pause button and audio time appear after generation', async ({ page }) => {
  128 |     // Catch console logs
  129 |     page.on('console', msg => console.log(`BROWSER LOG: ${msg.text()}`));
  130 | 
  131 |     // Mock AudioContext to prevent actual audio playback issues in headless and keep state
  132 |     await page.addInitScript(() => {
  133 |       console.log('MOCKING AudioContext');
  134 |       window.AudioContext = class MockAudioContext {
  135 |         state = 'running';
  136 |         createBuffer() { 
  137 |           console.log('MOCK createBuffer');
  138 |           return { duration: 5, getChannelData: () => new Float32Array(100) }; 
  139 |         }
  140 |         createBufferSource() {
  141 |           console.log('MOCK createBufferSource');
  142 |           const source = {
  143 |             buffer: null,
  144 |             connect: () => {},
  145 |             start: () => { console.log('MOCK source.start'); },
  146 |             stop: () => { console.log('MOCK source.stop'); },
  147 |             onended: null as any
  148 |           };
  149 |           return source;
  150 |         }
  151 |         suspend() { 
  152 |           console.log('MOCK suspend');
  153 |           this.state = 'suspended'; 
  154 |           return Promise.resolve(); 
  155 |         }
  156 |         resume() { 
  157 |           console.log('MOCK resume');
  158 |           this.state = 'running'; 
  159 |           return Promise.resolve(); 
  160 |         }
  161 |       } as any;
  162 |     });
  163 | 
  164 |     // Mock the Gemini API response
  165 |     await page.route('**/generativelanguage.googleapis.com/**', async route => {
  166 |       await route.fulfill({
  167 |         status: 200,
  168 |         contentType: 'application/json',
  169 |         body: JSON.stringify({
  170 |           candidates: [{
  171 |             content: {
  172 |               parts: [{
  173 |                 inlineData: {
  174 |                   data: "SGVsbG8gd29ybGQ=", // "Hello world" in base64
  175 |                   mimeType: "audio/pcm"
  176 |                 }
  177 |               }]
  178 |             }
  179 |           }]
  180 |         })
  181 |       });
  182 |     });
  183 | 
  184 |     const inputTab = page.getByRole('tab', { name: /Input Transcript/i });
  185 |     await inputTab.click();
  186 |     
  187 |     const textarea = page.getByPlaceholder(/Paste your transcript here/i);
  188 |     await textarea.fill('Testing audio playback and pause button.');
  189 |     
  190 |     const generateBtn = page.getByRole('button', { name: /Generate & Play/i, exact: true });
  191 |     await generateBtn.click();
  192 |     
  193 |     // The button should release immediately after processing (mocked)
  194 |     await expect(generateBtn).toBeEnabled();
  195 |     
  196 |     // Check for Pause button (it appears when isAudioPlaying is true)
  197 |     const pauseBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pause') });
> 198 |     await expect(pauseBtn).toBeVisible();
      |                            ^ Error: expect(locator).toBeVisible() failed
  199 |     
  200 |     // Check for Total Audio Time
  201 |     await expect(page.getByText(/Total Audio Time:/i)).toBeVisible();
  202 | 
  203 |     // Click Pause
  204 |     await pauseBtn.click();
  205 |     // After clicking pause, the icon should change to Play (since we toggle state)
  206 |     const playBtn = page.locator('button').filter({ has: page.locator('svg.lucide-play') });
  207 |     await expect(playBtn).toBeVisible();
  208 |   });
  209 | });
  210 | 
```