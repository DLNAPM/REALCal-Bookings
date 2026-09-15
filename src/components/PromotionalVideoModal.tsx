import React, { useState, useEffect, useRef } from 'react';
import { X, Youtube, ExternalLink, Play, RotateCcw, Video, Volume2, CheckCircle2 } from 'lucide-react';

interface PromotionalVideoModalProps {
    isOpen: boolean;
    onClose: () => void;
    videoUrl: string;
    propertyName: string;
}

export const PromotionalVideoModal: React.FC<PromotionalVideoModalProps> = ({
    isOpen,
    onClose,
    videoUrl,
    propertyName
}) => {
    const [isStoppedForExternal, setIsStoppedForExternal] = useState(false);
    const [externalPlatform, setExternalPlatform] = useState<'youtube' | 'vimeo' | 'external' | null>(null);
    const [playerKey, setPlayerKey] = useState(0);

    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const playerContainerRef = useRef<HTMLDivElement | null>(null);

    // Parse YouTube Video ID
    const ytMatch = videoUrl?.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    const youtubeId = ytMatch ? ytMatch[1] : null;
    const youtubeWatchUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : null;

    // Parse Vimeo ID
    const vimeoMatch = videoUrl?.match(/(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|))(\d+)/);
    const vimeoId = vimeoMatch ? vimeoMatch[1] : null;
    const vimeoWatchUrl = vimeoId ? `https://vimeo.com/${vimeoId}` : null;

    // Reset states when modal is opened or closed
    useEffect(() => {
        if (isOpen) {
            setIsStoppedForExternal(false);
            setExternalPlatform(null);
            setPlayerKey(prev => prev + 1);
        } else {
            // Guarantee all audio/playback ceases when modal closes
            stopInternalPlayback();
        }
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Send stop commands to any active internal player
    const stopInternalPlayback = () => {
        // Stop YouTube iframe
        if (iframeRef.current && iframeRef.current.contentWindow) {
            try {
                iframeRef.current.contentWindow.postMessage(
                    JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
                    '*'
                );
                iframeRef.current.contentWindow.postMessage(
                    JSON.stringify({ event: 'command', func: 'stopVideo', args: '' }),
                    '*'
                );
            } catch (err) {
                console.error('[VideoModal] Could not postMessage to iframe:', err);
            }
        }
        // Stop HTML5 video
        if (videoRef.current) {
            try {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            } catch (err) {
                console.error('[VideoModal] Could not pause HTML5 video:', err);
            }
        }
    };

    // User chooses to play the video in YouTube or external site
    const handleChooseExternalPlayback = (url: string, platform: 'youtube' | 'vimeo' | 'external') => {
        // 1. Instantly stop playback internally in the App
        stopInternalPlayback();

        // 2. Set state so the internal player stops completely and renders the clear confirmation overlay
        setIsStoppedForExternal(true);
        setExternalPlatform(platform);

        // 3. Open in YouTube in a new tab
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    // Resume playing inside the App
    const handleResumeInApp = () => {
        setIsStoppedForExternal(false);
        setExternalPlatform(null);
        setPlayerKey(prev => prev + 1); // remount fresh player with autoplay
    };

    // Detect user clicking the native "Watch on YouTube" button or link inside the YouTube iframe
    useEffect(() => {
        if (!isOpen || isStoppedForExternal || !youtubeId) return;

        let isHoveringPlayer = false;
        const container = playerContainerRef.current;

        const onMouseEnter = () => { isHoveringPlayer = true; };
        const onMouseLeave = () => { isHoveringPlayer = false; };

        container?.addEventListener('mouseenter', onMouseEnter);
        container?.addEventListener('mouseleave', onMouseLeave);

        // When a user clicks inside the YouTube iframe on the YouTube logo/link:
        // 1. YouTube spawns a new tab.
        // 2. The main window blurs (window.onblur).
        // 3. Document visibility changes (document.hidden === true).
        const handleWindowBlur = () => {
            // Check if activeElement is the iframe or user was hovering over the player
            if (isHoveringPlayer || document.activeElement === iframeRef.current) {
                console.log('[VideoModal] User opened YouTube from embedded player. Stopping internal playback.');
                stopInternalPlayback();
                setIsStoppedForExternal(true);
                setExternalPlatform('youtube');
            }
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                console.log('[VideoModal] Tab hidden while video was active. Stopping internal playback.');
                stopInternalPlayback();
                setIsStoppedForExternal(true);
                setExternalPlatform('youtube');
            }
        };

        window.addEventListener('blur', handleWindowBlur);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            container?.removeEventListener('mouseenter', onMouseEnter);
            container?.removeEventListener('mouseleave', onMouseLeave);
            window.removeEventListener('blur', handleWindowBlur);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [isOpen, isStoppedForExternal, youtubeId]);

    if (!isOpen || !videoUrl) return null;

    // Construct YouTube embed URL with JS API enabled so postMessage commands succeed
    const youtubeEmbedUrl = youtubeId
        ? `https://www.youtube.com/embed/${youtubeId}?autoplay=1&enablejsapi=1&origin=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}&rel=0`
        : null;

    const vimeoEmbedUrl = vimeoId
        ? `https://player.vimeo.com/video/${vimeoId}?autoplay=1`
        : null;

    return (
        <div
            id="promo-video-modal-backdrop"
            className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 md:p-8 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    stopInternalPlayback();
                    onClose();
                }
            }}
        >
            <div
                id="promo-video-modal-dialog"
                className="relative w-full max-w-5xl bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col"
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 px-6 border-b border-slate-800 bg-slate-900/90 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
                            <Video size={20} />
                        </div>
                        <div className="min-w-0">
                            <h3 className="text-lg font-bold text-white truncate">{propertyName}</h3>
                            <p className="text-xs text-slate-400 flex items-center gap-1.5">
                                <span>Promotional Video</span>
                                <span>&bull;</span>
                                <span className="text-indigo-400 font-medium">Full Mode</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        {/* Explicit "Play in YouTube" Button */}
                        {youtubeWatchUrl && (
                            <button
                                id="btn-play-in-youtube-header"
                                type="button"
                                onClick={() => handleChooseExternalPlayback(youtubeWatchUrl, 'youtube')}
                                className="flex items-center gap-2 px-3.5 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-900/30 transition-all hover:scale-[1.02] cursor-pointer border border-red-500/30"
                                title="Play video directly in YouTube and stop internal App playback"
                            >
                                <Youtube size={16} className="fill-current" />
                                <span className="hidden sm:inline">Play in YouTube</span>
                                <span className="sm:hidden">YouTube</span>
                                <ExternalLink size={12} className="opacity-80" />
                            </button>
                        )}

                        {/* Explicit "Play in Vimeo" Button */}
                        {vimeoWatchUrl && !youtubeWatchUrl && (
                            <button
                                id="btn-play-in-vimeo-header"
                                type="button"
                                onClick={() => handleChooseExternalPlayback(vimeoWatchUrl, 'vimeo')}
                                className="flex items-center gap-2 px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-lg transition-all hover:scale-[1.02] cursor-pointer"
                            >
                                <Video size={16} />
                                <span className="hidden sm:inline">Play in Vimeo</span>
                                <ExternalLink size={12} className="opacity-80" />
                            </button>
                        )}

                        {/* Close Modal Button */}
                        <button
                            id="btn-close-video-modal"
                            type="button"
                            onClick={() => {
                                stopInternalPlayback();
                                onClose();
                            }}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700"
                            aria-label="Close Video Modal"
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Video Screen Area */}
                <div
                    ref={playerContainerRef}
                    className="relative w-full aspect-video bg-black flex items-center justify-center overflow-hidden"
                >
                    {isStoppedForExternal ? (
                        /* Stopped Screen when Playing in YouTube / External */
                        <div
                            id="promo-video-stopped-panel"
                            className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-6 text-center z-20 animate-in fade-in zoom-in-95 duration-200"
                        >
                            <div className="w-16 h-16 rounded-2xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center mb-4 shadow-xl shadow-red-950/50 ring-4 ring-red-500/10">
                                {externalPlatform === 'youtube' ? (
                                    <Youtube size={36} className="fill-current" />
                                ) : (
                                    <Video size={36} />
                                )}
                            </div>

                            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider mb-2">
                                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                                Playing in {externalPlatform === 'youtube' ? 'YouTube' : 'External Player'}
                            </div>

                            <h4 className="text-xl sm:text-2xl font-bold text-white mb-2 max-w-lg">
                                Internal App Playback Stopped
                            </h4>

                            <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
                                The video was stopped inside the App so it does not play at the same time as the video in {externalPlatform === 'youtube' ? 'YouTube' : 'the external window'}.
                            </p>

                            <div className="flex flex-wrap items-center justify-center gap-3">
                                <button
                                    id="btn-resume-video-in-app"
                                    type="button"
                                    onClick={handleResumeInApp}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-xl shadow-lg shadow-indigo-900/30 transition-all hover:scale-105 cursor-pointer"
                                >
                                    <Play size={16} className="fill-current" /> Resume Playback in App
                                </button>

                                {youtubeWatchUrl && (
                                    <button
                                        id="btn-reopen-youtube"
                                        type="button"
                                        onClick={() => window.open(youtubeWatchUrl, '_blank', 'noopener,noreferrer')}
                                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-sm rounded-xl border border-slate-700 transition-colors cursor-pointer"
                                    >
                                        <ExternalLink size={15} /> Switch to YouTube Tab
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Active Video Player */
                        <div key={playerKey} className="w-full h-full relative">
                            {youtubeEmbedUrl ? (
                                <iframe
                                    ref={iframeRef}
                                    id="youtube-promo-iframe"
                                    src={youtubeEmbedUrl}
                                    title="Promotional Video"
                                    className="w-full h-full border-0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                />
                            ) : vimeoEmbedUrl ? (
                                <iframe
                                    ref={iframeRef}
                                    id="vimeo-promo-iframe"
                                    src={vimeoEmbedUrl}
                                    title="Promotional Video"
                                    className="w-full h-full border-0"
                                    allow="autoplay; fullscreen; picture-in-picture"
                                    allowFullScreen
                                />
                            ) : (
                                <video
                                    ref={videoRef}
                                    id="html5-promo-video"
                                    src={videoUrl}
                                    controls
                                    autoPlay
                                    playsInline
                                    className="w-full h-full object-contain"
                                >
                                    Your browser does not support video playback.
                                </video>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Guidance & Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-3 bg-slate-900/90 border-t border-slate-800 text-xs text-slate-400 gap-3">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        <span>
                            Audio synchronization protection active &bull; Selecting YouTube silences internal App sound.
                        </span>
                    </div>

                    {youtubeWatchUrl && !isStoppedForExternal && (
                        <button
                            id="btn-footer-switch-youtube"
                            type="button"
                            onClick={() => handleChooseExternalPlayback(youtubeWatchUrl, 'youtube')}
                            className="text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1 font-medium cursor-pointer underline underline-offset-4"
                        >
                            <Youtube size={14} /> Open in YouTube instead
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
