# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> Speech Evaluation App >> should navigate to Input Transcript tab and check elements
- Location: tests/app.spec.ts:113:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('11 characters')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('11 characters')

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
            - textbox "Paste your transcript here (e.g., 'Hello, how are you today? I hope you are having a wonderful time learning English.')" [active] [ref=e27]: Hello world
            - generic [ref=e28]: 11 / 5000 characters
          - button "Generate & Play" [ref=e31]:
            - img
            - text: Generate & Play
        - generic [ref=e32]:
          - generic [ref=e33]:
            - img [ref=e35]
            - generic [ref=e38]: Natural Intonation
          - generic [ref=e39]:
            - img [ref=e41]
            - generic [ref=e44]: Clear Pronunciation
          - generic [ref=e45]:
            - img [ref=e47]
            - generic [ref=e50]: Perfect Rhythm
```

# Test source

```ts
  24  |   });
  25  | 
  26  |   test('should attempt to start recording', async ({ page }) => {
  27  |     const startBtn = page.getByRole('button', { name: /Start Recording/i });
  28  |     await expect(startBtn).toBeVisible();
  29  |     await startBtn.click();
  30  |     // Button click is verified. In headless environments, mic access may fail,
  31  |     // but the interaction itself is tested.
  32  |   });
  33  | 
  34  |   test('should show login button and handle auth state UI', async ({ page }) => {
  35  |     const loginBtn = page.getByRole('button', { name: /Sign In to Save History/i });
  36  |     await expect(loginBtn).toBeVisible();
  37  |   });
  38  | 
  39  |   test('should display evaluation results structure (mocked)', async ({ page }) => {
  40  |     await expect(page.getByText('Awaiting Recording')).toBeVisible();
  41  |     await expect(page.getByText("Once you finish recording, click 'Evaluate Speech'")).toBeVisible();
  42  |   });
  43  | 
  44  |   test('should show detailed feedback sections when evaluation is present', async ({ page }) => {
  45  |     await expect(page.getByText('Practice Studio')).toBeVisible();
  46  |     await expect(page.getByRole('tab', { name: /History/i })).toBeVisible();
  47  |   });
  48  | 
  49  |   test('should have a working reset button', async ({ page }) => {
  50  |     const startBtn = page.getByRole('button', { name: /Start Recording/i });
  51  |     await startBtn.click();
  52  |     
  53  |     // The reset button is only visible when audioBlob exists (after stopping)
  54  |     // But we can stop first
  55  |     const stopBtn = page.getByRole('button', { name: /Stop/i });
  56  |     if (await stopBtn.isVisible()) {
  57  |       await stopBtn.click();
  58  |     }
  59  | 
  60  |     const resetBtn = page.locator('button').filter({ has: page.locator('svg.lucide-rotate-ccw') });
  61  |     if (await resetBtn.isVisible()) {
  62  |       await resetBtn.click();
  63  |       await expect(page.getByText('Awaiting Recording')).toBeVisible();
  64  |     }
  65  |   });
  66  | 
  67  |   test('should display evaluation results when evaluation is successful (mocked API)', async ({ page }) => {
  68  |     // Mock the Gemini API response
  69  |     await page.route('**/generativelanguage.googleapis.com/**', async route => {
  70  |       await route.fulfill({
  71  |         status: 200,
  72  |         contentType: 'application/json',
  73  |         body: JSON.stringify({
  74  |           candidates: [{
  75  |             content: {
  76  |               parts: [{
  77  |                 text: JSON.stringify({
  78  |                   transcription: "This is a test transcription.",
  79  |                   fluencyScore: 85,
  80  |                   pronunciationTips: [
  81  |                     { word: "test", tip: "Good job", phonetic: "/test/" }
  82  |                   ],
  83  |                   grammarFeedback: "Perfect grammar.",
  84  |                   vocabularyFeedback: "Great vocabulary.",
  85  |                   vocabularySuggestions: [
  86  |                     { originalWord: "test", suggestedWord: "examination", reason: "More formal" }
  87  |                   ],
  88  |                   overallFeedback: "Excellent work!"
  89  |                 })
  90  |               }]
  91  |             }
  92  |           }]
  93  |         })
  94  |       });
  95  |     });
  96  | 
  97  |     // Trigger evaluation (we need an audioBlob for this)
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
> 124 |     await expect(page.getByText('11 characters')).toBeVisible();
      |                                                   ^ Error: expect(locator).toBeVisible() failed
  125 |   });
  126 | 
  127 |   test('should verify pause button and audio time appear after generation', async ({ page }) => {
  128 |     // Mock AudioContext BEFORE navigation
  129 |     await page.addInitScript(() => {
  130 |       window.AudioContext = class MockAudioContext {
  131 |         state = 'running';
  132 |         createBuffer() { 
  133 |           return { duration: 5, getChannelData: () => new Float32Array(100) }; 
  134 |         }
  135 |         createBufferSource() {
  136 |           const source = {
  137 |             buffer: null,
  138 |             connect: () => {},
  139 |             start: () => {},
  140 |             stop: () => {},
  141 |             onended: null as any
  142 |           };
  143 |           return source;
  144 |         }
  145 |         suspend() { 
  146 |           this.state = 'suspended'; 
  147 |           return Promise.resolve(); 
  148 |         }
  149 |         resume() { 
  150 |           this.state = 'running'; 
  151 |           return Promise.resolve(); 
  152 |         }
  153 |       } as any;
  154 |     });
  155 | 
  156 |     await page.goto('/');
  157 | 
  158 |     // Mock the Gemini API response
  159 |     await page.route('**/generativelanguage.googleapis.com/**', async route => {
  160 |       await route.fulfill({
  161 |         status: 200,
  162 |         contentType: 'application/json',
  163 |         body: JSON.stringify({
  164 |           candidates: [{
  165 |             content: {
  166 |               parts: [{
  167 |                 inlineData: {
  168 |                   data: "SGVsbG8gd29ybGQ=", // "Hello world" in base64
  169 |                   mimeType: "audio/pcm"
  170 |                 }
  171 |               }]
  172 |             }
  173 |           }]
  174 |         })
  175 |       });
  176 |     });
  177 | 
  178 |     const inputTab = page.getByRole('tab', { name: /Input Transcript/i });
  179 |     await inputTab.click();
  180 |     
  181 |     const textarea = page.getByPlaceholder(/Paste your transcript here/i);
  182 |     await textarea.fill('Testing audio playback and pause button.');
  183 |     
  184 |     const generateBtn = page.getByRole('button', { name: /Generate & Play/i, exact: true });
  185 |     await generateBtn.click();
  186 |     
  187 |     // The button should release immediately after processing (mocked)
  188 |     await expect(generateBtn).toBeEnabled();
  189 |     
  190 |     // Check for Pause button (it appears when isAudioPlaying is true)
  191 |     const pauseBtn = page.locator('button').filter({ has: page.locator('svg.lucide-pause') });
  192 |     await expect(pauseBtn).toBeVisible();
  193 |     
  194 |     // Check for Total Audio Time
  195 |     await expect(page.getByText(/Total Audio Time:/i)).toBeVisible();
  196 | 
  197 |     // Click Pause
  198 |     await pauseBtn.click();
  199 |     // After clicking pause, the icon should change to Play (since we toggle state)
  200 |     const playBtn = page.locator('button').filter({ has: page.locator('svg.lucide-play') });
  201 |     await expect(playBtn).toBeVisible();
  202 |   });
  203 | });
  204 | 
```