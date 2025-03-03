document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const welcomeWindow = document.getElementById('welcomeWindow');
    const playerWindow = document.getElementById('playerWindow');
    const visualizerWindow = document.getElementById('visualizerWindow');
    const startListeningBtn = document.getElementById('startListening');
    const radioPlayer = document.getElementById('radioPlayer');
    const volumeSlider = document.getElementById('volumeSlider');
    const reloadStreamBtn = document.getElementById('reloadStreamBtn');
    const trackTitleText = document.querySelector('.track-title');
    const trackArtistText = document.querySelector('.track-artist');
    const albumArtImage = document.getElementById('albumArtImage');
    const albumArtContainer = document.querySelector('.album-art');
    
    // Desktop icons
    const welcomeIcon = document.getElementById('welcomeIcon');
    const radioIcon = document.getElementById('radioIcon');
    const visualizerIcon = document.getElementById('visualizerIcon');
    
    // Start Menu elements
    const startButton = document.getElementById('startButton');
    const startMenuPanel = document.getElementById('startMenuPanel');
    const startMenuWelcome = document.getElementById('startMenuWelcome');
    const startMenuRadio = document.getElementById('startMenuRadio');
    const startMenuVisualizer = document.getElementById('startMenuVisualizer');
    const startMenuPlayPause = document.getElementById('startMenuPlayPause');
    const startMenuReload = document.getElementById('startMenuReload');
    
    // Taskbar elements
    const taskbarWelcome = document.getElementById('taskbarWelcome');
    const taskbarRadio = document.getElementById('taskbarRadio');
    const taskbarVisualizer = document.getElementById('taskbarVisualizer');
    
    // Visualizer elements
    const visualizerCanvas = document.getElementById('visualizerCanvas');
    const changeVisualizerBtn = document.getElementById('changeVisualizerBtn');
    const visualizerStatusText = document.getElementById('visualizerStatusText');
    
    // Window persistence
    const STORAGE_KEY = 'djLordJordWindowState';
    
    // Now Playing update functionality
    let currentTrack = '';
    let currentArtist = '';
    let currentAlbumArt = '';
    let nowPlayingInterval;
    
    // Function to parse track information
    function parseTrackInfo(title) {
        // Common formats: "Artist - Title", "Title - Artist", "Artist: Title"
        const separators = [' - ', ': '];
        for (const separator of separators) {
            if (title.includes(separator)) {
                const [part1, part2] = title.split(separator);
                // Assume the longer part is the title
                if (part1.length > part2.length) {
                    return { title: part1.trim(), artist: part2.trim() };
                } else {
                    return { title: part2.trim(), artist: part1.trim() };
                }
            }
        }
        return { title: title.trim(), artist: 'Unknown Artist' };
    }
    
    // Function to fetch album art
    async function fetchAlbumArt(artist, title) {
        try {
            // First search for the release using MusicBrainz API
            const searchResponse = await fetch(
                `https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(title)}%20AND%20artist:${encodeURIComponent(artist)}&fmt=json`,
                {
                    headers: {
                        'User-Agent': 'DJ_Lord_Jord_Radio/1.0.0 (https://jordisbored.xyz)'
                    }
                }
            );
            const searchData = await searchResponse.json();
            
            // Get the first matching release
            const recording = searchData.recordings?.[0];
            if (recording) {
                // Try to get album art from the first release
                const releaseId = recording.releases?.[0]?.id;
                if (releaseId) {
                    // Try to fetch from Cover Art Archive
                    try {
                        const coverArtResponse = await fetch(`https://coverartarchive.org/release/${releaseId}`);
                        if (coverArtResponse.ok) {
                            const coverArtData = await coverArtResponse.json();
                            // Get the front cover or the first available image
                            const frontCover = coverArtData.images.find(img => img.front) || coverArtData.images[0];
                            if (frontCover) {
                                return frontCover.image;
                            }
                        }
                    } catch (coverError) {
                        console.warn('Error fetching cover art:', coverError);
                    }
                }
                
                // Fallback to Spotify search if no cover art found
                try {
                    const spotifyResponse = await fetch(
                        `https://api.spotify.com/v1/search?q=${encodeURIComponent(title + ' ' + artist)}&type=track&limit=1`,
                        {
                            headers: {
                                'Accept': 'application/json'
                            }
                        }
                    );
                    if (spotifyResponse.ok) {
                        const spotifyData = await spotifyResponse.json();
                        const track = spotifyData.tracks?.items?.[0];
                        if (track?.album?.images?.[0]?.url) {
                            return track.album.images[0].url;
                        }
                    }
                } catch (spotifyError) {
                    console.warn('Error fetching from Spotify:', spotifyError);
                }
            }
        } catch (error) {
            console.warn('Error fetching album art:', error);
        }
        
        // If all methods fail, try a direct DuckDuckGo image search
        try {
            const searchQuery = `${artist} ${title} album cover`;
            const ddgResponse = await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(searchQuery)}&iax=images&ia=images&format=json`);
            const ddgData = await ddgResponse.json();
            if (ddgData.Image) {
                return ddgData.Image;
            }
        } catch (ddgError) {
            console.warn('Error fetching from DuckDuckGo:', ddgError);
        }
        
        return null;
    }
    
    // Function to update album art display
    function updateAlbumArt(imageUrl) {
        if (imageUrl && imageUrl !== currentAlbumArt) {
            // Preload the image
            const tempImage = new Image();
            tempImage.onload = () => {
                currentAlbumArt = imageUrl;
                albumArtImage.src = imageUrl;
                albumArtContainer.classList.add('visible');
            };
            tempImage.onerror = () => {
                // If image fails to load, hide the album art container
                albumArtContainer.classList.remove('visible');
                albumArtImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
            };
            tempImage.src = imageUrl;
        } else if (!imageUrl) {
            // Use default transparent image
            albumArtContainer.classList.remove('visible');
            albumArtImage.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
        }
    }
    
    // Function to fetch now playing information
    async function updateNowPlaying() {
        try {
            // Try to fetch from the Icecast metadata endpoint
            const response = await fetch('https://jordisbored.xyz/listen/dj_lord_jord/status-json.xsl');
            const data = await response.json();
            
            // Extract the current track from the Icecast response
            const newTrack = data?.icestats?.source?.title || 'DJ Lord Jord Radio';
            
            // Only update if the track has changed
            if (newTrack !== currentTrack) {
                currentTrack = newTrack;
                
                // Parse track information
                const { title, artist } = parseTrackInfo(currentTrack);
                
                // Update the display with a fade effect
                if (trackTitleText) {
                    trackTitleText.style.opacity = '0';
                    setTimeout(() => {
                        trackTitleText.textContent = title;
                        trackTitleText.style.opacity = '1';
                    }, 300);
                }
                
                if (trackArtistText) {
                    trackArtistText.style.opacity = '0';
                    setTimeout(() => {
                        trackArtistText.textContent = artist;
                        trackArtistText.style.opacity = '1';
                    }, 300);
                }
                
                // Update window title
                playerWindow.querySelector('.window-title').textContent = `Now Playing: ${title}`;
                
                // Fetch and update album art
                const albumArtUrl = await fetchAlbumArt(artist, title);
                updateAlbumArt(albumArtUrl);
            }
        } catch (error) {
            console.warn('Error fetching now playing:', error);
            // Fallback to default text if there's an error
            if (!currentTrack) {
                currentTrack = 'DJ Lord Jord Radio';
                if (trackTitleText) {
                    trackTitleText.textContent = currentTrack;
                }
                if (trackArtistText) {
                    trackArtistText.textContent = 'Live Stream';
                }
                updateAlbumArt(null);
            }
        }
    }
    
    // Function to start now playing updates
    function startNowPlayingUpdates() {
        // Clear any existing interval
        if (nowPlayingInterval) {
            clearInterval(nowPlayingInterval);
        }
        
        // Update immediately
        updateNowPlaying();
        
        // Then update every 10 seconds
        nowPlayingInterval = setInterval(updateNowPlaying, 10000);
    }
    
    // Function to stop now playing updates
    function stopNowPlayingUpdates() {
        if (nowPlayingInterval) {
            clearInterval(nowPlayingInterval);
            nowPlayingInterval = null;
        }
    }
    
    // Function to save window state
    function saveWindowState() {
        const windowState = {
            welcomeWindow: {
                display: welcomeWindow.style.display,
                top: welcomeWindow.style.top,
                left: welcomeWindow.style.left,
                width: welcomeWindow.style.width,
                height: welcomeWindow.style.height,
                zIndex: welcomeWindow.style.zIndex
            },
            playerWindow: {
                display: playerWindow.style.display,
                top: playerWindow.style.top,
                left: playerWindow.style.left,
                right: playerWindow.style.right,
                width: playerWindow.style.width,
                height: playerWindow.style.height,
                zIndex: playerWindow.style.zIndex
            },
            visualizerWindow: {
                display: visualizerWindow.style.display,
                top: visualizerWindow.style.top,
                left: visualizerWindow.style.left,
                width: visualizerWindow.style.width,
                height: visualizerWindow.style.height,
                zIndex: visualizerWindow.style.zIndex,
                visualizerType: visualizerType
            },
            volume: radioPlayer.volume,
            isPlaying: !radioPlayer.paused
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(windowState));
        console.log('Window state saved');
        
        // Update taskbar active states
        updateTaskbarActiveStates();
    }
    
    // Function to restore window state
    function restoreWindowState() {
        try {
            const savedState = localStorage.getItem(STORAGE_KEY);
            if (!savedState) return false;
            
            const windowState = JSON.parse(savedState);
            
            // Restore welcome window
            if (windowState.welcomeWindow) {
                if (windowState.welcomeWindow.display !== 'none') {
                    welcomeWindow.style.display = 'block';
                } else {
                    welcomeWindow.style.display = 'none';
                }
                
                if (windowState.welcomeWindow.top) welcomeWindow.style.top = windowState.welcomeWindow.top;
                if (windowState.welcomeWindow.left) welcomeWindow.style.left = windowState.welcomeWindow.left;
                if (windowState.welcomeWindow.width) welcomeWindow.style.width = windowState.welcomeWindow.width;
                if (windowState.welcomeWindow.height) welcomeWindow.style.height = windowState.welcomeWindow.height;
                if (windowState.welcomeWindow.zIndex) welcomeWindow.style.zIndex = windowState.welcomeWindow.zIndex;
                
                // Restore minimized state
                if (windowState.welcomeWindow.minimized) {
                    const content = welcomeWindow.querySelector('.window-content');
                    windowState.welcomeWindow.originalHeight = welcomeWindow.style.height;
                    content.style.display = 'none';
                    welcomeWindow.style.height = 'auto';
                }
            }
            
            // Restore player window
            if (windowState.playerWindow) {
                if (windowState.playerWindow.display !== 'none') {
                    playerWindow.style.display = 'block';
                } else {
                    playerWindow.style.display = 'none';
                }
                
                if (windowState.playerWindow.top) playerWindow.style.top = windowState.playerWindow.top;
                if (windowState.playerWindow.left) playerWindow.style.left = windowState.playerWindow.left;
                if (windowState.playerWindow.right) playerWindow.style.right = windowState.playerWindow.right;
                if (windowState.playerWindow.width) playerWindow.style.width = windowState.playerWindow.width;
                if (windowState.playerWindow.height) playerWindow.style.height = windowState.playerWindow.height;
                if (windowState.playerWindow.zIndex) playerWindow.style.zIndex = windowState.playerWindow.zIndex;
                
                // Restore minimized state
                if (windowState.playerWindow.minimized) {
                    const content = playerWindow.querySelector('.window-content');
                    playerWindow.dataset.originalHeight = playerWindow.style.height;
                    content.style.display = 'none';
                    playerWindow.style.height = 'auto';
                }
            }
            
            // Restore visualizer window
            if (windowState.visualizerWindow) {
                if (windowState.visualizerWindow.display !== 'none') {
                    visualizerWindow.style.display = 'block';
                    
                    // Initialize visualizer if it's visible
                    setTimeout(() => {
                        if (radioPlayer.paused) {
                            initDummyVisualizer();
                        } else {
                            initVisualizer();
                        }
                    }, 500);
                } else {
                    visualizerWindow.style.display = 'none';
                }
                
                if (windowState.visualizerWindow.top) visualizerWindow.style.top = windowState.visualizerWindow.top;
                if (windowState.visualizerWindow.left) visualizerWindow.style.left = windowState.visualizerWindow.left;
                if (windowState.visualizerWindow.width) visualizerWindow.style.width = windowState.visualizerWindow.width;
                if (windowState.visualizerWindow.height) visualizerWindow.style.height = windowState.visualizerWindow.height;
                if (windowState.visualizerWindow.zIndex) visualizerWindow.style.zIndex = windowState.visualizerWindow.zIndex;
                
                // Restore visualizer type
                if (windowState.visualizerWindow.visualizerType !== undefined) {
                    visualizerType = windowState.visualizerWindow.visualizerType;
                }
                
                // Restore minimized state
                if (windowState.visualizerWindow.minimized) {
                    const content = visualizerWindow.querySelector('.window-content');
                    visualizerWindow.dataset.originalHeight = visualizerWindow.style.height;
                    content.style.display = 'none';
                    visualizerWindow.style.height = 'auto';
                }
            }
            
            // Restore volume
            if (windowState.volume !== undefined) {
                radioPlayer.volume = windowState.volume;
                volumeSlider.value = windowState.volume;
            }
            
            // Restore play state
            if (windowState.isPlaying) {
                setTimeout(() => {
                    playRadio();
                }, 1000);
            }
            
            // Update taskbar active states
            updateTaskbarActiveStates();
            
            // Update play/pause button state
            if (startMenuPlayPause) {
                if (windowState.isPlaying) {
                    startMenuPlayPause.querySelector('i').classList.remove('fa-play');
                    startMenuPlayPause.querySelector('i').classList.add('fa-pause');
                    startMenuPlayPause.querySelector('span').textContent = 'Pause Stream';
                } else {
                    startMenuPlayPause.querySelector('i').classList.remove('fa-pause');
                    startMenuPlayPause.querySelector('i').classList.add('fa-play');
                    startMenuPlayPause.querySelector('span').textContent = 'Play Stream';
                }
            }
            
            console.log('Window state restored');
            return true;
        } catch (error) {
            console.error('Error restoring window state:', error);
            return false;
        }
    }
    
    // Save window state when user leaves the page
    window.addEventListener('beforeunload', saveWindowState);
    
    // Save window state periodically (every 5 seconds)
    setInterval(saveWindowState, 5000);
    
    // Set initial volume
    radioPlayer.volume = volumeSlider.value;
    
    // Fix for stream playback - preload metadata
    radioPlayer.preload = 'metadata';
    
    // Reload stream button
    reloadStreamBtn.addEventListener('click', () => {
        // Reset the audio element
        radioPlayer.pause();
        
        // Force reload the stream
        const audioSource = radioPlayer.querySelector('source');
        if (audioSource) {
            // Add a cache-busting parameter
            audioSource.src = `https://jordisbored.xyz/listen/dj_lord_jord/radio.mp3?t=${Date.now()}`;
            radioPlayer.load();
        }
        
        // Try to play again
        setTimeout(() => {
            playRadio();
        }, 500);
    });
    
    // Window management
    const windows = document.querySelectorAll('.window');
    
    // Function to get the highest z-index among windows
    function getHighestZIndex() {
        let maxZ = 10; // Default minimum z-index
        document.querySelectorAll('.window').forEach(win => {
            const zIndex = parseInt(window.getComputedStyle(win).zIndex, 10);
            if (!isNaN(zIndex) && zIndex > maxZ) {
                maxZ = zIndex;
            }
        });
        return maxZ;
    }
    
    // Function to make windows draggable
    function makeWindowDraggable(windowElement) {
        const header = windowElement.querySelector('.window-header');
        let isDragging = false;
        let offsetX, offsetY;
        
        header.addEventListener('mousedown', (e) => {
            // Ignore if clicking on buttons
            if (e.target.tagName === 'BUTTON') return;
            
            isDragging = true;
            windowElement.style.zIndex = getHighestZIndex() + 1;
            const rect = windowElement.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            
            // Add a class to indicate dragging
            windowElement.classList.add('dragging');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const x = e.clientX - offsetX;
            const y = e.clientY - offsetY;
            
            // Keep window within viewport bounds
            const maxX = window.innerWidth - windowElement.offsetWidth;
            const maxY = window.innerHeight - windowElement.offsetHeight;
            
            windowElement.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
            windowElement.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
            
            // If this is the player window, clear the right property
            if (windowElement === playerWindow) {
                windowElement.style.right = 'auto';
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                windowElement.classList.remove('dragging');
                saveWindowState();
            }
        });
    }
    
    // Function to make windows resizable
    function makeWindowResizable(windowElement) {
        const resizeHandle = windowElement.querySelector('.resize-handle');
        let isResizing = false;
        let startX, startY, startWidth, startHeight;
        
        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startY = e.clientY;
            startWidth = parseInt(document.defaultView.getComputedStyle(windowElement).width, 10);
            startHeight = parseInt(document.defaultView.getComputedStyle(windowElement).height, 10);
            
            // Add a class to indicate resizing
            windowElement.classList.add('resizing');
        });
        
        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            
            const width = startWidth + e.clientX - startX;
            const height = startHeight + e.clientY - startY;
            
            // Set minimum size
            if (width > 200) windowElement.style.width = `${width}px`;
            if (height > 150) windowElement.style.height = `${height}px`;
            
            // If this is the visualizer window, resize the canvas
            if (windowElement.id === 'visualizerWindow') {
                resizeVisualizerCanvas();
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                windowElement.classList.remove('resizing');
                saveWindowState();
            }
        });
    }
    
    // Apply draggable and resizable to all windows
    windows.forEach(windowElement => {
        makeWindowDraggable(windowElement);
        makeWindowResizable(windowElement);
        
        // Window controls (close only)
        const closeBtn = windowElement.querySelector('.close-btn');
        
        closeBtn.addEventListener('click', () => {
            windowElement.style.display = 'none';
            updateTaskbarActiveStates();
            saveWindowState();
        });
    });
    
    // Function to show the radio player
    function showRadioPlayer() {
        // Make sure the player window is visible with block display
        playerWindow.style.display = 'block';
        
        // Position the player window separately from welcome window
        // Only set default position if it doesn't have a position yet
        if (!playerWindow.style.top && !playerWindow.style.left) {
            playerWindow.style.top = '100px';
            playerWindow.style.right = '100px';
            playerWindow.style.left = 'auto';
        }
        
        // Bring to front
        windows.forEach(win => {
            win.style.zIndex = 10;
        });
        playerWindow.style.zIndex = 20;
        
        // Try to play the audio with better error handling
        playRadio();
        
        // Save window state after showing
        saveWindowState();
    }
    
    // Function to play radio with better error handling
    function playRadio() {
        // First, make sure the source is correctly set
        const audioSource = radioPlayer.querySelector('source');
        if (audioSource) {
            audioSource.src = 'https://jordisbored.xyz/listen/dj_lord_jord/radio.mp3';
            radioPlayer.load(); // Important: reload the audio element after changing source
        }
        
        // Now try to play with proper error handling
        const playPromise = radioPlayer.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                console.log('Audio playback started successfully');
                // Start visualizer if it's visible
                if (visualizerWindow.style.display !== 'none') {
                    // Reset and reinitialize visualizer when audio starts playing
                    isVisualizerInitialized = false;
                    initVisualizer();
                }
                startNowPlayingUpdates();
                saveWindowState(); // Save state after successful playback
            }).catch(error => {
                console.error('Error playing audio:', error);
                
                // Check for specific errors
                if (error.name === 'NotAllowedError') {
                    alert('Playback was blocked by the browser. Please interact with the page first.');
                } else if (error.name === 'NotSupportedError') {
                    alert('The audio format is not supported by your browser.');
                } else {
                    // Try alternative method for stream
                    tryAlternativePlayback();
                }
            });
        }
    }
    
    // Alternative playback method for streams
    function tryAlternativePlayback() {
        // Create a new audio element programmatically
        const newAudio = new Audio('https://jordisbored.xyz/listen/dj_lord_jord/radio.mp3');
        newAudio.volume = radioPlayer.volume;
        
        // Replace the existing audio element
        const oldAudio = radioPlayer;
        const parentElement = oldAudio.parentElement;
        
        if (parentElement) {
            // Copy attributes and event listeners
            newAudio.controls = oldAudio.controls;
            newAudio.id = oldAudio.id;
            
            // Replace the element
            parentElement.replaceChild(newAudio, oldAudio);
            
            // Update the reference
            radioPlayer = newAudio;
            
            // Add volume control
            radioPlayer.addEventListener('input', () => {
                radioPlayer.volume = volumeSlider.value;
            });
            
            // Try to play
            radioPlayer.play().catch(error => {
                console.error('Alternative playback also failed:', error);
                alert('Could not play audio stream. Please check your connection or try a different browser.');
            });
        }
    }
    
    // Function to show the welcome window
    function showWelcomeWindow() {
        welcomeWindow.style.display = 'block';
        
        // Only set default position if it doesn't have a position yet
        if (!welcomeWindow.style.top && !welcomeWindow.style.left) {
            welcomeWindow.style.top = 'calc(50% - 175px)';
            welcomeWindow.style.left = 'calc(50% - 200px)';
        }
        
        // Bring to front
        windows.forEach(win => {
            win.style.zIndex = 10;
        });
        welcomeWindow.style.zIndex = 20;
        
        // Save window state after showing
        saveWindowState();
    }
    
    // Function to show the visualizer window
    function showVisualizerWindow() {
        visualizerWindow.style.display = 'block';
        
        // Only set default position if it doesn't have a position yet
        if (!visualizerWindow.style.top && !visualizerWindow.style.left) {
            visualizerWindow.style.top = '150px';
            visualizerWindow.style.left = 'calc(50% - 300px)';
        }
        
        // Bring to front
        windows.forEach(win => {
            win.style.zIndex = 10;
        });
        visualizerWindow.style.zIndex = 20;
        
        // Initialize or restart visualizer
        if (radioPlayer.paused) {
            // If audio is not playing, use dummy visualizer
            initDummyVisualizer();
        } else {
            // If audio is playing, use real visualizer
            initVisualizer();
        }
        
        // Save window state after showing
        saveWindowState();
    }
    
    // Desktop icon event listeners
    welcomeIcon.addEventListener('click', showWelcomeWindow);
    radioIcon.addEventListener('click', showRadioPlayer);
    visualizerIcon.addEventListener('click', showVisualizerWindow);
    
    // Start Listening button
    startListeningBtn.addEventListener('click', showRadioPlayer);
    
    // Volume control
    volumeSlider.addEventListener('input', () => {
        radioPlayer.volume = volumeSlider.value;
        saveWindowState(); // Save state after volume change
    });
    
    // Add visual effect when audio is playing
    radioPlayer.addEventListener('play', () => {
        document.querySelector('.vinyl-record').style.animationPlayState = 'running';
        startNowPlayingUpdates();
        
        // Start visualizer if it's visible
        if (visualizerWindow.style.display !== 'none') {
            if (!isVisualizerInitialized) {
                initVisualizer();
            }
        }
    });

    radioPlayer.addEventListener('pause', () => {
        document.querySelector('.vinyl-record').style.animationPlayState = 'paused';
        stopNowPlayingUpdates();
    });

    // Add some random movement to the background
    function animateBackground() {
        const background = document.querySelector('.background');
        let x = 0;
        let y = 0;
        
        setInterval(() => {
            x += (Math.random() - 0.5) * 2;
            y += (Math.random() - 0.5) * 2;
            
            background.style.backgroundPosition = `${x}px ${y}px`;
        }, 50);
    }

    animateBackground();

    // Show windows on page load - try to restore from localStorage first
    setTimeout(() => {
        const restored = restoreWindowState();
        
        // If restoration failed, show default windows
        if (!restored) {
            // Show the welcome window by default
            welcomeWindow.style.display = 'block';
            welcomeWindow.style.top = 'calc(50% - 175px)';
            welcomeWindow.style.left = 'calc(50% - 200px)';
            
            // Show the radio player window separately
            playerWindow.style.display = 'block';
            playerWindow.style.top = '100px';
            playerWindow.style.right = '100px';
            playerWindow.style.left = 'auto';
        }
    }, 500);
    
    // Visualizer implementation
    let audioContext;
    let analyser;
    let dataArray;
    let canvasCtx;
    let visualizerType = 0; // 0: bars, 1: waves, 2: particles, 3: milkdrop
    let animationFrameId;
    let particles = [];
    let audioSource;
    let isVisualizerInitialized = false;
    
    // Function to update visualizer status
    function updateVisualizerStatus(status) {
        if (visualizerStatusText) {
            visualizerStatusText.textContent = `Status: ${status}`;
        }
    }
    
    function initVisualizer() {
        try {
            updateVisualizerStatus('Initializing...');
            
            // Always create a new audio context to avoid issues with reusing the old one
            if (audioContext) {
                // Close previous context if it exists
                try {
                    audioContext.close();
                } catch (e) {
                    console.warn('Could not close previous audio context:', e);
                }
            }
            
            // Create new audio context
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume audio context (needed for newer browsers)
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            
            // Create analyzer
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048;
            
            // Connect audio element to analyzer
            try {
                audioSource = audioContext.createMediaElementSource(radioPlayer);
                audioSource.connect(analyser);
                analyser.connect(audioContext.destination);
                updateVisualizerStatus('Connected to audio');
            } catch (e) {
                console.warn('Error connecting audio source, trying alternative method:', e);
                updateVisualizerStatus('Using alternative method');
                
                // Alternative method: create a stream destination and connect it
                const dest = audioContext.createMediaStreamDestination();
                analyser.connect(dest);
                
                // Just connect the analyzer to the destination for visualization
                analyser.connect(audioContext.destination);
                
                // Use dummy data for visualization
                setInterval(() => {
                    const dummyData = new Uint8Array(analyser.frequencyBinCount);
                    for (let i = 0; i < dummyData.length; i++) {
                        dummyData[i] = Math.random() * 255;
                    }
                    analyser.getByteFrequencyData(dummyData);
                }, 50);
            }
            
            // Set up canvas
            canvasCtx = visualizerCanvas.getContext('2d');
            resizeVisualizerCanvas();
            
            // Set up data array for analyzer
            const bufferLength = analyser.frequencyBinCount;
            dataArray = new Uint8Array(bufferLength);
            
            // Initialize particles for particle visualizer
            initParticles();
            
            // Start visualization
            cancelAnimationFrame(animationFrameId);
            drawVisualizer();
            
            isVisualizerInitialized = true;
            console.log('Visualizer initialized successfully');
            updateVisualizerStatus('Active - Web Audio API');
        } catch (error) {
            console.error('Error initializing visualizer:', error);
            updateVisualizerStatus('Error: ' + error.message);
            
            // Fallback to dummy visualizer if audio context fails
            initDummyVisualizer();
        }
    }
    
    // Change visualizer type
    changeVisualizerBtn.addEventListener('click', () => {
        visualizerType = (visualizerType + 1) % 4;
        
        // Update status with current effect
        const effects = ['Bars', 'Waves', 'Particles', 'Milkdrop'];
        const currentMode = isVisualizerInitialized ? 'Web Audio API' : 'Fallback Mode';
        updateVisualizerStatus(`Active - ${effects[visualizerType]} (${currentMode})`);
        
        // If we're using the dummy visualizer, we need to update the UI
        if (!isVisualizerInitialized) {
            // Cancel any existing animation
            cancelAnimationFrame(animationFrameId);
            
            // Start the dummy visualizer with the new type
            drawDummyVisualizer();
        }
    });
    
    // Add a button to force the fallback visualizer
    const visualizerControls = document.querySelector('.visualizer-controls');
    if (visualizerControls) {
        const forceFallbackBtn = document.createElement('button');
        forceFallbackBtn.textContent = 'Force Fallback';
        forceFallbackBtn.className = 'action-button';
        forceFallbackBtn.style.marginLeft = '10px';
        visualizerControls.appendChild(forceFallbackBtn);
        
        forceFallbackBtn.addEventListener('click', () => {
            // Force the fallback visualizer
            isVisualizerInitialized = false;
            
            // Cancel any existing animation
            cancelAnimationFrame(animationFrameId);
            
            // Clear any existing audio context
            if (audioContext) {
                try {
                    audioContext.close();
                } catch (e) {
                    console.warn('Could not close audio context:', e);
                }
                audioContext = null;
            }
            
            // Initialize the dummy visualizer
            initDummyVisualizer();
        });
    }
    
    // Improved dummy visualizer with more realistic audio-like patterns
    function initDummyVisualizer() {
        updateVisualizerStatus('Initializing fallback...');
        
        canvasCtx = visualizerCanvas.getContext('2d');
        resizeVisualizerCanvas();
        
        // Create dummy data with a more realistic audio-like pattern
        dataArray = new Uint8Array(128);
        
        // Initialize with a pattern
        for (let i = 0; i < dataArray.length; i++) {
            // Create a bell curve pattern
            const center = dataArray.length / 2;
            const distance = Math.abs(i - center);
            const value = Math.max(0, 255 * Math.exp(-(distance * distance) / (2 * (center / 3) * (center / 3))));
            dataArray[i] = value * Math.random();
        }
        
        // Start dummy visualization
        cancelAnimationFrame(animationFrameId);
        drawDummyVisualizer();
        
        console.log('Fallback visualizer initialized');
        updateVisualizerStatus('Active - Fallback Mode');
    }
    
    function drawDummyVisualizer() {
        animationFrameId = requestAnimationFrame(drawDummyVisualizer);
        
        // Update dummy data to simulate audio reactivity
        const time = performance.now() / 1000;
        
        for (let i = 0; i < dataArray.length; i++) {
            // Base value with some randomness
            let baseValue = dataArray[i];
            
            // Add time-based oscillation
            const oscillation = 30 * Math.sin(time * 2 + i * 0.1) + 20 * Math.sin(time * 3.7 + i * 0.05);
            
            // Add some random noise
            const noise = Math.random() * 15 - 7.5;
            
            // Update value
            baseValue += oscillation + noise;
            
            // Constrain to valid range
            dataArray[i] = Math.max(0, Math.min(255, baseValue));
        }
        
        // Clear canvas
        canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        
        // Draw based on current visualizer type
        switch (visualizerType) {
            case 0:
                drawBars();
                break;
            case 1:
                drawWaves();
                break;
            case 2:
                drawParticles();
                break;
            case 3:
                drawMilkdrop();
                break;
        }
    }
    
    function resizeVisualizerCanvas() {
        if (visualizerCanvas) {
            visualizerCanvas.width = visualizerCanvas.offsetWidth;
            visualizerCanvas.height = visualizerCanvas.offsetHeight;
        }
    }
    
    function initParticles() {
        particles = [];
        const particleCount = 100;
        
        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * visualizerCanvas.width,
                y: Math.random() * visualizerCanvas.height,
                size: Math.random() * 5 + 1,
                speed: Math.random() * 3 + 1,
                color: `hsl(${Math.random() * 360}, 100%, 50%)`,
                angle: Math.random() * Math.PI * 2
            });
        }
    }
    
    function drawVisualizer() {
        animationFrameId = requestAnimationFrame(drawVisualizer);
        
        // Get frequency data
        analyser.getByteFrequencyData(dataArray);
        
        // Clear canvas
        canvasCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        
        // Draw based on current visualizer type
        switch (visualizerType) {
            case 0:
                drawBars();
                break;
            case 1:
                drawWaves();
                break;
            case 2:
                drawParticles();
                break;
            case 3:
                drawMilkdrop();
                break;
        }
    }
    
    function drawBars() {
        const barWidth = (visualizerCanvas.width / dataArray.length) * 2.5;
        let barHeight;
        let x = 0;

        // Calculate average for reactivity
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        
        for (let i = 0; i < dataArray.length; i++) {
            barHeight = (dataArray[i] / 255) * visualizerCanvas.height * 0.8;
            
            // Add some oscillation based on time
            const time = performance.now() / 1000;
            const oscillation = Math.sin(time * 2 + i * 0.1) * 5;
            barHeight += oscillation;

            // Create gradient with dynamic colors based on audio intensity
            const gradient = canvasCtx.createLinearGradient(0, visualizerCanvas.height - barHeight, 0, visualizerCanvas.height);
            const hue = ((i / dataArray.length * 180) + time * 30) % 360;
            gradient.addColorStop(0, `hsla(${hue}, 100%, 50%, 0.8)`);
            gradient.addColorStop(1, `hsla(${hue + 60}, 100%, 30%, 0.6)`);
            
            canvasCtx.fillStyle = gradient;
            
            // Draw bar with rounded corners
            canvasCtx.beginPath();
            canvasCtx.roundRect(x, visualizerCanvas.height - barHeight, barWidth - 1, barHeight, 5);
            canvasCtx.fill();

            // Add glow effect based on audio intensity
            canvasCtx.shadowBlur = avg / 10;
            canvasCtx.shadowColor = `hsla(${hue}, 100%, 50%, 0.5)`;
            
            x += barWidth;
            if (x > visualizerCanvas.width) break;
        }
        
        // Reset shadow effect
        canvasCtx.shadowBlur = 0;
    }
    
    function drawWaves() {
        const time = performance.now() / 1000;
        
        // Draw multiple waves with different phases and colors
        for (let wave = 0; wave < 3; wave++) {
            canvasCtx.beginPath();
            canvasCtx.lineWidth = 3 - wave;
            
            // Create dynamic color based on wave number and time
            const hue = (wave * 120 + time * 30) % 360;
            canvasCtx.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.7 - wave * 0.2})`;
            
            // Add glow effect
            canvasCtx.shadowBlur = 10;
            canvasCtx.shadowColor = `hsla(${hue}, 100%, 50%, 0.5)`;
            
            const sliceWidth = visualizerCanvas.width / dataArray.length;
            let x = 0;
            let lastY = visualizerCanvas.height / 2;
            
            for (let i = 0; i < dataArray.length; i++) {
                const v = dataArray[i] / 128.0;
                const phase = wave * Math.PI / 4 + time * 2;
                const y = v * visualizerCanvas.height / 3 + 
                         Math.sin(x / 50 + phase) * 20 +
                         visualizerCanvas.height / 2;
                
                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    // Use quadratic curves for smoother lines
                    const xc = (x + x - sliceWidth) / 2;
                    const yc = (y + lastY) / 2;
                    canvasCtx.quadraticCurveTo(x - sliceWidth, lastY, xc, yc);
                }
                
                lastY = y;
                x += sliceWidth;
            }
            
            // Complete the wave
            canvasCtx.lineTo(visualizerCanvas.width, visualizerCanvas.height / 2);
            canvasCtx.stroke();
        }
        
        // Reset shadow effect
        canvasCtx.shadowBlur = 0;
    }
    
    function drawParticles() {
        const time = performance.now() / 1000;
        
        // Calculate audio reactivity
        let bassSum = 0;
        let trebleSum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            if (i < dataArray.length * 0.2) {
                bassSum += dataArray[i];
            } else {
                trebleSum += dataArray[i];
            }
        }
        const bassIntensity = bassSum / (dataArray.length * 0.2) / 255;
        const trebleIntensity = trebleSum / (dataArray.length * 0.8) / 255;
        
        // Update and draw particles
        particles.forEach((particle, index) => {
            // Update particle movement based on audio
            const angle = particle.angle + (bassIntensity * 0.1);
            const speed = particle.speed * (1 + trebleIntensity);
            
            // Add circular motion
            const radius = 100 * (1 + bassIntensity);
            const circleX = Math.cos(time + index * 0.1) * radius;
            const circleY = Math.sin(time + index * 0.1) * radius;
            
            particle.x += Math.cos(angle) * speed + circleX * 0.01;
            particle.y += Math.sin(angle) * speed + circleY * 0.01;
            
            // Wrap around edges with smooth transition
            if (particle.x < 0) particle.x = visualizerCanvas.width;
            if (particle.x > visualizerCanvas.width) particle.x = 0;
            if (particle.y < 0) particle.y = visualizerCanvas.height;
            if (particle.y > visualizerCanvas.height) particle.y = 0;
            
            // Calculate particle size based on audio
            const size = particle.size * (1 + bassIntensity * 2);
            
            // Draw particle with glow effect
            canvasCtx.beginPath();
            canvasCtx.shadowBlur = 15 * trebleIntensity;
            canvasCtx.shadowColor = particle.color;
            canvasCtx.fillStyle = particle.color;
            canvasCtx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            canvasCtx.fill();
            
            // Add connecting lines between nearby particles
            particles.forEach((other, otherIndex) => {
                if (otherIndex <= index) return; // Avoid duplicate lines
                
                const dx = other.x - particle.x;
                const dy = other.y - particle.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 100) {
                    canvasCtx.beginPath();
                    canvasCtx.strokeStyle = `rgba(255, 255, 255, ${(1 - distance / 100) * 0.2})`;
                    canvasCtx.lineWidth = 1;
                    canvasCtx.moveTo(particle.x, particle.y);
                    canvasCtx.lineTo(other.x, other.y);
                    canvasCtx.stroke();
                }
            });
        });
        
        // Reset shadow effect
        canvasCtx.shadowBlur = 0;
    }
    
    function drawMilkdrop() {
        const time = performance.now() / 1000;
        
        // Calculate audio reactivity
        let bassSum = 0;
        let midSum = 0;
        let trebleSum = 0;
        
        for (let i = 0; i < dataArray.length; i++) {
            if (i < dataArray.length * 0.1) {
                bassSum += dataArray[i];
            } else if (i < dataArray.length * 0.5) {
                midSum += dataArray[i];
            } else {
                trebleSum += dataArray[i];
            }
        }
        
        const bass = bassSum / (dataArray.length * 0.1) / 255;
        const mid = midSum / (dataArray.length * 0.4) / 255;
        const treble = trebleSum / (dataArray.length * 0.5) / 255;
        
        // Create dynamic background
        const gradient = canvasCtx.createRadialGradient(
            visualizerCanvas.width / 2, visualizerCanvas.height / 2, 0,
            visualizerCanvas.width / 2, visualizerCanvas.height / 2, 
            visualizerCanvas.width * (0.5 + bass * 0.2)
        );
        
        gradient.addColorStop(0, `hsla(${time * 30}, 100%, 50%, 1)`);
        gradient.addColorStop(0.5, `hsla(${time * 30 + 120}, 100%, 30%, 0.5)`);
        gradient.addColorStop(1, `hsla(${time * 30 + 240}, 100%, 10%, 0.8)`);
        
        canvasCtx.fillStyle = gradient;
        canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        
        // Draw dynamic shapes
        const numShapes = 5;
        for (let i = 0; i < numShapes; i++) {
            const phase = (i / numShapes) * Math.PI * 2;
            const size = visualizerCanvas.width * (0.1 + bass * 0.2);
            const x = visualizerCanvas.width / 2 + Math.cos(time + phase) * size;
            const y = visualizerCanvas.height / 2 + Math.sin(time + phase) * size;
            
            // Draw shape
            canvasCtx.beginPath();
            canvasCtx.moveTo(x, y);
            
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
                const radius = size * (0.5 + Math.sin(angle * 3 + time) * 0.2);
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                canvasCtx.lineTo(px, py);
            }
            
            canvasCtx.closePath();
            
            // Add glow effect
            canvasCtx.shadowBlur = 20 * treble;
            canvasCtx.shadowColor = `hsla(${time * 100 + i * 50}, 100%, 50%, 0.5)`;
            
            // Fill with gradient
            const shapeGradient = canvasCtx.createRadialGradient(x, y, 0, x, y, size);
            shapeGradient.addColorStop(0, `hsla(${time * 100 + i * 50}, 100%, 50%, 0.8)`);
            shapeGradient.addColorStop(1, `hsla(${time * 100 + i * 50 + 180}, 100%, 30%, 0)`);
            
            canvasCtx.fillStyle = shapeGradient;
            canvasCtx.fill();
        }
        
        // Draw reactive waveform overlay
        canvasCtx.beginPath();
        canvasCtx.strokeStyle = `rgba(255, 255, 255, ${0.2 + mid * 0.3})`;
        canvasCtx.lineWidth = 2;
        
        for (let i = 0; i < visualizerCanvas.width; i++) {
            const index = Math.floor(i / visualizerCanvas.width * dataArray.length);
            const value = dataArray[index] / 255;
            
            const y = visualizerCanvas.height / 2 + 
                     Math.sin(i / 50 + time * 3) * 50 * value + 
                     Math.cos(i / 30 - time * 2) * 30 * mid;
            
            if (i === 0) {
                canvasCtx.moveTo(i, y);
            } else {
                canvasCtx.lineTo(i, y);
            }
        }
        
        canvasCtx.stroke();
        
        // Reset shadow effect
        canvasCtx.shadowBlur = 0;
    }
    
    // Handle window resize
    window.addEventListener('resize', resizeVisualizerCanvas);
    
    // Add error handling for audio stream
    radioPlayer.addEventListener('error', (e) => {
        console.error('Audio error:', e);
        alert(`Audio error: ${radioPlayer.error ? radioPlayer.error.message : 'Unknown error'}`);
    });

    // Start Menu functionality
    startButton.addEventListener('click', () => {
        startMenuPanel.classList.toggle('active');
    });
    
    // Close start menu when clicking outside
    document.addEventListener('click', (e) => {
        if (!startMenuPanel.contains(e.target) && !startButton.contains(e.target)) {
            startMenuPanel.classList.remove('active');
        }
    });
    
    // Start Menu item click handlers
    startMenuWelcome.addEventListener('click', () => {
        showWelcomeWindow();
        startMenuPanel.classList.remove('active');
    });
    
    startMenuRadio.addEventListener('click', () => {
        showRadioPlayer();
        startMenuPanel.classList.remove('active');
    });
    
    startMenuVisualizer.addEventListener('click', () => {
        showVisualizerWindow();
        startMenuPanel.classList.remove('active');
    });
    
    startMenuPlayPause.addEventListener('click', () => {
        if (radioPlayer.paused) {
            playRadio();
            startMenuPlayPause.querySelector('i').classList.remove('fa-play');
            startMenuPlayPause.querySelector('i').classList.add('fa-pause');
            startMenuPlayPause.querySelector('span').textContent = 'Pause Stream';
        } else {
            radioPlayer.pause();
            startMenuPlayPause.querySelector('i').classList.remove('fa-pause');
            startMenuPlayPause.querySelector('i').classList.add('fa-play');
            startMenuPlayPause.querySelector('span').textContent = 'Play Stream';
        }
        startMenuPanel.classList.remove('active');
    });
    
    startMenuReload.addEventListener('click', () => {
        reloadStream();
        startMenuPanel.classList.remove('active');
    });
    
    // Taskbar item click handlers
    taskbarWelcome.addEventListener('click', () => {
        if (welcomeWindow.style.display === 'none') {
            showWelcomeWindow();
        } else {
            welcomeWindow.style.display = 'none';
        }
        updateTaskbarActiveStates();
        saveWindowState();
    });
    
    taskbarRadio.addEventListener('click', () => {
        if (playerWindow.style.display === 'none') {
            showRadioPlayer();
        } else {
            playerWindow.style.display = 'none';
        }
        updateTaskbarActiveStates();
        saveWindowState();
    });
    
    taskbarVisualizer.addEventListener('click', () => {
        if (visualizerWindow.style.display === 'none') {
            showVisualizerWindow();
        } else {
            visualizerWindow.style.display = 'none';
        }
        updateTaskbarActiveStates();
        saveWindowState();
    });
    
    // Function to update taskbar active states
    function updateTaskbarActiveStates() {
        taskbarWelcome.classList.toggle('active', welcomeWindow.style.display !== 'none');
        taskbarRadio.classList.toggle('active', playerWindow.style.display !== 'none');
        taskbarVisualizer.classList.toggle('active', visualizerWindow.style.display !== 'none');
    }
    
    // Function to reload the stream
    function reloadStream() {
        // Reset the audio element
        radioPlayer.pause();
        
        // Force reload the stream
        const audioSource = radioPlayer.querySelector('source');
        if (audioSource) {
            // Add a cache-busting parameter
            audioSource.src = `https://jordisbored.xyz/listen/dj_lord_jord/radio.mp3?t=${Date.now()}`;
            radioPlayer.load();
        }
        
        // Try to play again
        setTimeout(() => {
            playRadio();
        }, 500);
    }
    
    // Update play/pause button state when audio state changes
    radioPlayer.addEventListener('play', () => {
        if (startMenuPlayPause) {
            startMenuPlayPause.querySelector('i').classList.remove('fa-play');
            startMenuPlayPause.querySelector('i').classList.add('fa-pause');
            startMenuPlayPause.querySelector('span').textContent = 'Pause Stream';
        }
    });
    
    radioPlayer.addEventListener('pause', () => {
        if (startMenuPlayPause) {
            startMenuPlayPause.querySelector('i').classList.remove('fa-pause');
            startMenuPlayPause.querySelector('i').classList.add('fa-play');
            startMenuPlayPause.querySelector('span').textContent = 'Play Stream';
        }
    });
}); 