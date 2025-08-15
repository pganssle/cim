# Chord Identification Method Trainer
This is an implementation of [Eguchi\'s Chord Identification method](http://pom.sagepub.com/content/42/1/86) (paper access can be found via [Sci-Hub](https://en.wikipedia.org/wiki/Sci-Hub)). See also [Ichionkai Music School](https://ichionkai.co.jp/english3.html).

[Here is a short video explaining how we use it](https://youtu.be/kNfkm6PQC20).

This is a method for teaching absolute pitch to children aged 2-6.  Children should practice \~5x per day for 2-3 minutes (about 20-25 identifications). Chords are always identified with colors, and progress in the sequence red (CEG), yellow (CFA), blue (HDG), black (ACF), green (DGH), orange (EGC), purple (FAC), pink (GHD), brown (GCE).

Introduce the chords to the children one at a time, spacing out new chord introductions by at least 2 weeks each time. Do not introduce a new chord until the child can identify all presented chords with 100% accuracy.

**Note**: This application is an early alpha. I\'m still in the first training phase so I\'ve put off work on the later parts of the method until my son catches up. Let me know if you need a feature to make this work, of if it seems that I\'ve misunderstood the method as described in the paper.

## Setup Instructions

### Prerequisites

- **Ruby**
- **Bundler** gem (`gem install bundler`)
- **Make** (usually pre-installed on macOS/Linux)

1. **Initialize the repositorys**
   ```bash
   make init
   ```
   This will install Jekyll and other required gems specified in the Gemfile.

2. **Run the development server**
   ```bash
   make serve
   ```
   Open your browser and navigate to `http://localhost:4000`   

### Android Version Setup

#### Prerequisites

- All web version prerequisites
- **Android Studio** (latest stable version)
- **Java Development Kit (JDK)** 11 or higher
- Android SDK with minimum API level 21

1. **Complete the web setup first** 

2. **Build the Android assets**
   ```bash
   make android-setup
   ```
   This command will:
   - Clean the Android assets directory
   - Build the Jekyll site with Android-specific configurations
   - Place the built files in `android-wrapper/app/src/main/assets/`

3. **Open Android Studio**
   - Open Android Studio
   - Select "Open an Existing Project"
   - Navigate to the `android-wrapper` folder in the cloned repository
   - Click "OK"

4. **Sync and build the project**
   - Android Studio will prompt you to sync the project with Gradle files - click "Sync Now"
   - Wait for the Gradle sync to complete
   - If prompted to install missing SDK components, click "Install missing SDK package(s)"

5. **Run the app**
   - Connect an Android device via USB (with USB debugging enabled) or start an Android emulator
   - Click the "Run" button (green play icon) in Android Studio
   - Select your device/emulator
   - The app will build and install automatically

## Contributing

Feel free to open issues or pull requests or fork the code! The site is designed to be be easy to re-host or run locally. I am not exactly the world's best UX designer or front-end developer, but I am a heavy consumer of this app, so any improvements would be heartily welcomed!

