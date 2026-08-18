document.addEventListener('DOMContentLoaded', function() {
    
    // ============================================
    // Mobile Menu Toggle
    // ============================================
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    if (mobileMenuBtn && mobileMenu) {
        // Toggle menu on button click
        mobileMenuBtn.addEventListener('click', function() {
            mobileMenuBtn.classList.toggle('active');
            mobileMenu.classList.toggle('active');
            
            // Prevent body scroll when menu is open
            if (mobileMenu.classList.contains('active')) {
                document.body.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
            }
        });

        // Close menu when clicking on a link
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', function() {
                mobileMenuBtn.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            });
        });

        // Close menu when clicking outside
        document.addEventListener('click', function(event) {
            const isClickInsideMenu = mobileMenu.contains(event.target);
            const isClickOnButton = mobileMenuBtn.contains(event.target);
            
            if (!isClickInsideMenu && !isClickOnButton && mobileMenu.classList.contains('active')) {
                mobileMenuBtn.classList.remove('active');
                mobileMenu.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    }

    // ============================================
    // Hero Typing Animation (Home Page Only)
    // ============================================
    const typingText = document.getElementById('typing-text');
    
    if (typingText) {
        const phrases = [
            "Simplify your studies.",
            "Organize your tasks.",
            "Ace your exams."
        ];
        let phraseIndex = 0;
        let charIndex = 0;
        let isDeleting = false;

        function type() {
            const currentPhrase = phrases[phraseIndex];
            
            if (isDeleting) {
                typingText.textContent = currentPhrase.substring(0, charIndex - 1);
                charIndex--;
            } else {
                typingText.textContent = currentPhrase.substring(0, charIndex + 1);
                charIndex++;
            }

            let typeSpeed = isDeleting ? 50 : 100;

            if (!isDeleting && charIndex === currentPhrase.length) {
                typeSpeed = 2000;
                isDeleting = true;
            } else if (isDeleting && charIndex === 0) {
                isDeleting = false;
                phraseIndex = (phraseIndex + 1) % phrases.length;
                typeSpeed = 500;
            }

            setTimeout(type, typeSpeed);
        }

        type();
    }

    // ============================================
    // Video Player (Home Page Only)
    // ============================================
    const demoVideo = document.getElementById('demoVideo');
    const videoOverlay = document.getElementById('videoOverlay');
    const playButton = document.getElementById('playButton');
    const customControls = document.getElementById('customControls');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const progressBar = document.getElementById('progressBar');
    const currentTimeEl = document.getElementById('currentTime');
    const durationEl = document.getElementById('duration');
    const volumeBtn = document.getElementById('volumeBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');

    if (demoVideo && videoOverlay && playButton) {
        // Play video when overlay/play button is clicked
        function playVideo() {
            demoVideo.play();
            videoOverlay.classList.add('hidden');
        }

        videoOverlay.addEventListener('click', playVideo);
        playButton.addEventListener('click', function(e) {
            e.stopPropagation();
            playVideo();
        });

        // Play/Pause toggle
        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                if (demoVideo.paused) {
                    demoVideo.play();
                } else {
                    demoVideo.pause();
                }
            });
        }

        // Update progress bar
        demoVideo.addEventListener('timeupdate', function() {
            if (progressBar) {
                const progress = (demoVideo.currentTime / demoVideo.duration) * 100;
                progressBar.value = progress;
            }
            if (currentTimeEl) {
                currentTimeEl.textContent = formatTime(demoVideo.currentTime);
            }
        });

        // Set duration
        demoVideo.addEventListener('loadedmetadata', function() {
            if (durationEl) {
                durationEl.textContent = formatTime(demoVideo.duration);
            }
        });

        // Seek video
        if (progressBar) {
            progressBar.addEventListener('input', function() {
                const time = (progressBar.value / 100) * demoVideo.duration;
                demoVideo.currentTime = time;
            });
        }

        // Volume toggle
        if (volumeBtn) {
            volumeBtn.addEventListener('click', function() {
                demoVideo.muted = !demoVideo.muted;
            });
        }

        // Fullscreen toggle
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', function() {
                if (demoVideo.requestFullscreen) {
                    demoVideo.requestFullscreen();
                } else if (demoVideo.webkitRequestFullscreen) {
                    demoVideo.webkitRequestFullscreen();
                } else if (demoVideo.msRequestFullscreen) {
                    demoVideo.msRequestFullscreen();
                }
            });
        }

        // Show overlay when video ends
        demoVideo.addEventListener('ended', function() {
            videoOverlay.classList.remove('hidden');
            if (customControls) {
                customControls.classList.remove('visible');
            }
        });

        // Format time helper
        function formatTime(seconds) {
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    }

    // ============================================
    // FAQ Accordion
    // ============================================
    const faqQuestions = document.querySelectorAll('.faq-question');

    if (faqQuestions.length > 0) {
        faqQuestions.forEach(question => {
            question.addEventListener('click', function() {
                const faqItem = this.parentElement;
                const isActive = faqItem.classList.contains('active');

                // Close all other FAQ items
                document.querySelectorAll('.faq-item').forEach(item => {
                    item.classList.remove('active');
                });

                // Toggle current item
                if (!isActive) {
                    faqItem.classList.add('active');
                }
            });
        });
    }


    // FEATURES PAGE TABS 
    const tabButtons = document.querySelectorAll('.platform-tabs .tab-button');
    
    if (tabButtons.length > 0) {
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const selectedTab = this.getAttribute('data-tab');
                
                // Remove active class from all buttons
                tabButtons.forEach(btn => btn.classList.remove('active'));
                
                // Add active class to clicked button
                this.classList.add('active');
                
                // Hide all images
                const allImages = document.querySelectorAll('.feature-image-wrapper');
                allImages.forEach(img => img.classList.remove('active'));
                
                // Show selected tab images
                if (selectedTab === 'website') {
                    document.querySelectorAll('.website-image').forEach(img => {
                        img.classList.add('active');
                    });
                } else if (selectedTab === 'mobile') {
                    document.querySelectorAll('.mobile-image').forEach(img => {
                        img.classList.add('active');
                    });
                }
            });
        });
    }

});