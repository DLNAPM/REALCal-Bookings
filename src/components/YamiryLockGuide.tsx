import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Shield, ArrowRight, Video, ChevronRight, CheckCircle, Smartphone } from 'lucide-react';

interface YamiryLockGuideProps {
  accessCode?: string;
  roomLockNumber?: string;
}

export const YamiryLockGuide: React.FC<YamiryLockGuideProps> = ({ accessCode, roomLockNumber }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0); // 0 to 100
  const [activeStep, setActiveStep] = useState<number>(0); // 0: Touch, 1: Enter, 2: Green, 3: Pull Handle
  const [isMuted, setIsMuted] = useState<boolean>(true);
  
  // Custom states for lock simulation
  const [isKeypadLit, setIsKeypadLit] = useState<boolean>(false);
  const [inputDigits, setInputDigits] = useState<string[]>([]);
  const [activeDigitIndex, setActiveDigitIndex] = useState<number>(-1);
  const [indicatorColor, setIndicatorColor] = useState<'none' | 'blue' | 'green' | 'red'>('none');
  const [handleAngle, setHandleAngle] = useState<number>(0);
  const [isDoorOpen, setIsDoorOpen] = useState<boolean>(false);

  // Auto playback loop simulation
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const displayCode = accessCode || "124793"; // Placeholder code if none provided
  const digitsToPress = [...displayCode.split(''), '#'];

  const steps = [
    {
      title: "1. Wake Up Keypad",
      desc: "Touch or place your palm on the sensor touch screen to light up the blue keypad backlight.",
      duration: 25, // covers progress 0% - 25%
    },
    {
      title: "2. Enter Access Code + #",
      desc: `Carefully type your code (${displayCode}) and press the '#' key in the bottom right corner to submit.`,
      duration: 55, // covers progress 25% - 80%
    },
    {
      title: "3. Wait for Green Indicator",
      desc: "The smart lock verifies the code. The indicator bar turns bright green with a verification chime.",
      duration: 10, // covers progress 80% - 90%
    },
    {
      title: "4. Press Lever down & Open",
      desc: "Press the lever handle downwards and pull or push to open the door. Re-locks automatically in 5 seconds.",
      duration: 10, // covers progress 90% - 100%
    }
  ];

  // Synthesis engine for clean bleep sounds if unmuted
  const playBeep = (freq: number, duration: number, type: 'sine' | 'square' | 'triangle' | 'sawtooth' = 'sine') => {
    if (isMuted) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn("Sound play block", e);
    }
  };

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setProgress((prev) => {
          const next = prev + 1;
          if (next >= 100) {
            // Reset simulation items
            setIsKeypadLit(false);
            setInputDigits([]);
            setIndicatorColor('none');
            setHandleAngle(0);
            setIsDoorOpen(false);
            setActiveDigitIndex(-1);
            return 0;
          }
          return next;
        });
      }, 160); // Total loop roughly ~16 seconds
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying]);

  // Synchronize state of lock based on progress
  useEffect(() => {
    if (progress < 15) {
      // Resting state
      setActiveStep(0);
      setIsKeypadLit(false);
      setInputDigits([]);
      setIndicatorColor('none');
      setHandleAngle(0);
      setIsDoorOpen(false);
      setActiveDigitIndex(-1);
    } else if (progress >= 15 && progress < 25) {
      // Touch screen, wake-up
      setActiveStep(0);
      if (!isKeypadLit) {
        setIsKeypadLit(true);
        setIndicatorColor('none');
        playBeep(440, 0.1); // awake beep
      }
    } else if (progress >= 25 && progress < 80) {
      // Typing sequence
      setActiveStep(1);
      setIsKeypadLit(true);
      setIndicatorColor('none');
      setHandleAngle(0);
      setIsDoorOpen(false);

      // Map progress to pressing key indices
      const codeProgressSpan = 80 - 25; // 55% progress scope
      const progressOffset = progress - 25;
      const singleKeySpan = codeProgressSpan / digitsToPress.length;
      const targetDigitIdx = Math.floor(progressOffset / singleKeySpan);

      if (targetDigitIdx >= 0 && targetDigitIdx < digitsToPress.length) {
        if (targetDigitIdx !== activeDigitIndex) {
          setActiveDigitIndex(targetDigitIdx);
          const pressedDigit = digitsToPress[targetDigitIdx];
          
          setInputDigits(prev => {
            if (prev.length < targetDigitIdx + 1) {
              const res = [...prev, pressedDigit];
              if (pressedDigit === '#') {
                playBeep(880, 0.15, 'sine'); // verify press
              } else {
                playBeep(523.25, 0.08, 'sine'); // digit beep
              }
              return res;
            }
            return prev;
          });
        }
      }
    } else if (progress >= 80 && progress < 90) {
      // Success Verification (Green glow)
      setActiveStep(2);
      setIsKeypadLit(true);
      if (indicatorColor !== 'green') {
        setIndicatorColor('green');
        playBeep(987.77, 0.15, 'sine');
        setTimeout(() => playBeep(1318.51, 0.25, 'sine'), 100);
      }
      setHandleAngle(0);
      setIsDoorOpen(false);
      setActiveDigitIndex(-1);
    } else if (progress >= 90 && progress < 98) {
      // Handle depression and opening
      setActiveStep(3);
      setIsKeypadLit(true);
      setIndicatorColor('green');
      setHandleAngle(45); // rot angle
      setIsDoorOpen(true);
      setActiveDigitIndex(-1);
    } else {
      // Returning, resetting
      setIsKeypadLit(false);
      setHandleAngle(0);
      setIsDoorOpen(false);
      setIndicatorColor('none');
    }
  }, [progress]);

  const handleSeek = (value: number) => {
    setProgress(value);
  };

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex === 0) setProgress(16);
    if (stepIndex === 1) setProgress(30);
    if (stepIndex === 2) setProgress(82);
    if (stepIndex === 3) setProgress(92);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 md:p-8 text-white max-w-4xl mx-auto my-8 font-sans">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-5">
        <div>
          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5 mb-2">
            <Video size={12} className="animate-pulse" /> Animated Video Guide
          </span>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">How to Open the YAMIRY [YR04] Smart Lock</h2>
          <p className="text-slate-400 text-sm mt-1">Watch this interactive animated simulator showing step-by-step room access.</p>
        </div>
        <div className="flex items-center gap-3">
          {roomLockNumber && (
            <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-xl text-center">
              <div className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Your Lock Num</div>
              <div className="text-sm font-mono font-bold text-orange-400">{roomLockNumber}</div>
            </div>
          )}
          <div className="bg-slate-850/50 border border-slate-750 p-1.5 rounded-xl flex items-center gap-2">
            <button 
              onClick={() => setIsMuted(!isMuted)} 
              className={`p-2.5 rounded-lg transition-all ${isMuted ? 'bg-slate-800 text-slate-500 hover:text-slate-300' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'}`}
              title={isMuted ? "Unmute simulation audio" : "Mute audio"}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="animate-bounce" />}
            </button>
            <span className="text-xs text-slate-400 pr-2 font-medium hidden sm:inline">{isMuted ? "Sound: Off" : "Sound: On"}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Animated Screen / Video Player Box (Col 7) */}
        <div className="lg:col-span-7 bg-slate-950 rounded-2xl border border-slate-800/80 p-6 flex flex-col justify-between items-center relative min-h-[380px] overflow-hidden group">
          
          {/* Audio Enable Overlay Alert If muted */}
          {isMuted && progress === 0 && (
            <div className="absolute top-4 left-4 bg-slate-900/95 border border-slate-800 py-1.5 px-3 rounded-lg text-xs text-slate-300 z-10 hidden sm:flex items-center gap-2 animate-bounce cursor-pointer" onClick={() => setIsMuted(false)}>
              <VolumeX size={12} className="text-slate-500" />
              <span>Click speaker icon for sound effects!</span>
            </div>
          )}

          {/* Locked/Unlocked Live Banner overlay */}
          <div className="absolute top-4 right-4 z-10">
            <span className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 shadow-md border ${
              isDoorOpen 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : 'bg-slate-900/90 text-slate-400 border-slate-850'
            }`}>
              <Shield size={12} className={isDoorOpen ? "text-emerald-400 animate-spin-slow" : "text-slate-400"} />
              {isDoorOpen ? "UNLOCKED & OPEN" : "SECURED / LOCKED"}
            </span>
          </div>

          <div className="w-full flex-1 flex items-center justify-center py-6">
            {/* Real SVG simulation of the beautiful black YAMIRY YR04 smart lever lock */}
            <svg width="220" height="300" viewBox="0 0 220 300" fill="none" className="drop-shadow-2xl">
              {/* Outer plate shadow/frame */}
              <rect x="70" y="20" width="80" height="260" rx="40" fill="#0d1117" stroke="#21262d" strokeWidth="4" />
              <rect x="74" y="24" width="72" height="252" rx="36" fill="#161b22" />

              {/* Status Indicator Bar at bottom or top of screen */}
              <rect x="95" y="38" width="30" height="6" rx="3" fill={
                indicatorColor === 'green' ? '#10b981' :
                indicatorColor === 'blue' ? '#3b82f6' :
                indicatorColor === 'red' ? '#ef4444' : '#334155'
              } className="transition-all duration-300" />

              {/* Backlit glow for indicator */}
              {indicatorColor === 'green' && (
                <rect x="93" y="36" width="34" height="10" rx="5" fill="#10b981" fillOpacity="0.15" className="animate-pulse" />
              )}

              {/* Touch Keypad Face Plate */}
              <rect x="85" y="55" width="50" height="90" rx="10" fill="#090d11" stroke="#30363d" />

              {/* Interactive Keypad Numbers inside SVG */}
              {Array.from({ length: 4 }).map((_, rIdx) => {
                const rowKeys = [
                  ['1', '2', '3'],
                  ['4', '5', '6'],
                  ['7', '8', '9'],
                  ['*', '0', '#']
                ][rIdx];

                return rowKeys.map((key, cIdx) => {
                  const x = 93 + (cIdx * 16);
                  const y = 70 + (rIdx * 18);
                  const isBeingPressedKey = digitsToPress[activeDigitIndex] === key;
                  
                  return (
                    <g key={key}>
                      {/* Glow background if key is active/lit or typed */}
                      {isKeypadLit && (
                        <circle cx={x} cy={y} r="6" fill="#6366f1" fillOpacity={isBeingPressedKey ? "0.6" : "0.1"} className="transition-all duration-200" />
                      )}
                      <text 
                        x={x} 
                        y={y + 2.5} 
                        fontSize="7" 
                        fontFamily="monospace" 
                        fontWeight="bold" 
                        textAnchor="middle" 
                        fill={
                          isBeingPressedKey ? '#ffffff' :
                          isKeypadLit ? '#a5b4fc' : '#4b5563'
                        }
                        className="transition-colors duration-200 select-none"
                      >
                        {key}
                      </text>
                    </g>
                  );
                });
              })}

              {/* Custom Typed Code Text Box visualizer inside smart lock screen */}
              {isKeypadLit && (
                <g>
                  <rect x="90" y="130" width="40" height="8" rx="2" fill="#000" stroke="#21262d" />
                  <text x="110" y="136" fontSize="5" fontFamily="monospace" fill="#38bdf8" textAnchor="middle" fontWeight="black tracking-widest">
                    {inputDigits.map(d => d === '#' ? '' : d).join('') || "------"}
                  </text>
                </g>
              )}

              {/* Rotatable Door Handle (Smart Lever) */}
              <g transform={`translate(110, 185) rotate(${handleAngle})`}>
                {/* Connecting bolt */}
                <circle cx="0" cy="0" r="16" fill="#30363d" stroke="#484f58" strokeWidth="2" />
                <circle cx="0" cy="0" r="10" fill="#21262d" />
                <circle cx="0" cy="0" r="4" fill="#8b949e" />

                {/* Lever arm sticking out dynamically to the right */}
                <path d="M 12 -12 L 80 -12 C 86 -12 88 -6 88 0 C 88 6 86 12 80 12 L 12 12 Z" fill="#30363d" stroke="#484f58" strokeWidth="2" />
                {/* Highlight details */}
                <path d="M 20 -4 L 74 -4" stroke="#484f58" strokeWidth="1.5" strokeLinecap="round" />
              </g>

              {/* Hand/Finger pointing simulator that flies into the plate */}
              {activeStep === 0 && progress > 5 && (
                <g transform="translate(130, 95)" className="animate-pulse">
                  <circle cx="0" cy="0" r="18" fill="#6366f1" fillOpacity="0.2" />
                  <circle cx="0" cy="0" r="8" fill="#6366f1" fillOpacity="0.4" />
                  {/* Glowing touch point */}
                  <circle cx="0" cy="0" r="3" fill="#ffffff" />
                </g>
              )}
            </svg>

            {/* Simulated cracked door open image display backdrop */}
            {isDoorOpen && (
              <div className="absolute inset-0 bg-indigo-950/20 pointer-events-none border border-emerald-500 rounded-2xl flex items-center justify-center animate-pulse z-0 mb-14">
                <div className="bg-emerald-950/90 text-emerald-400 border border-emerald-500/30 font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  LOCK DISENGAGED: Open Door Now!
                </div>
              </div>
            )}
          </div>

          {/* Dynamic Display Caption */}
          <div className="w-full text-center bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 min-h-[56px] text-xs sm:text-sm text-slate-300 flex items-center justify-center">
            {progress < 15 ? "Press PLAY below to watch the operating sequence." : steps[activeStep].desc}
          </div>

          {/* Real Animated Video Playback Seek Bar and Controls bar */}
          <div className="w-full max-w-full mt-4 flex flex-col gap-3">
            {/* Timeline Bar */}
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono text-slate-500">
                0:{String(Math.floor((progress % 60) * 0.15)).padStart(2, '0')}
              </span>
              <input 
                type="range" 
                min="0" 
                max="99" 
                value={progress}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none"
              />
              <span className="text-[10px] font-mono text-slate-500">0:15</span>
            </div>

            {/* Video Action Button deck */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setIsPlaying(!isPlaying)} 
                  className="bg-indigo-600 hover:bg-indigo-505 text-white p-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center"
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>
                <button 
                  onClick={() => {
                    setProgress(0);
                    setIsPlaying(true);
                  }} 
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2.5 rounded-xl transition-colors flex items-center justify-center"
                  title="Restart animation"
                >
                  <RotateCcw size={16} />
                </button>
              </div>
              <div className="text-xs bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-slate-400 font-medium">
                Playback Speed: <span className="font-bold text-slate-200">1.0x (Auto)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Informative Visual Progress list layout (Col 5) */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <span className="text-[11px] font-extrabold text-slate-500 uppercase tracking-widest block">STEPS TIMELINES</span>
            
            <div className="space-y-2.5">
              {steps.map((step, idx) => {
                const isCurrent = activeStep === idx && progress >= 15;
                const isPassed = activeStep > idx;
                
                return (
                  <button 
                    key={idx}
                    onClick={() => handleStepClick(idx)}
                    className={`w-full text-left p-3.5 rounded-2xl border transition-all duration-300 flex items-start gap-3.5 ${
                      isCurrent 
                        ? 'bg-slate-850 border-indigo-500/80 shadow-lg shadow-indigo-500/5' 
                        : isPassed
                          ? 'bg-slate-900/60 border-slate-800/50 opacity-60'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full shrink-0 flex items-center justify-center text-xs font-black transition-all ${
                      isCurrent 
                        ? 'bg-indigo-600 text-white' 
                        : isPassed
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400'
                    }`}>
                      {isPassed ? <CheckCircle size={14} /> : idx + 1}
                    </div>
                    <div>
                      <h4 className={`text-xs font-extrabold tracking-tight ${isCurrent ? 'text-indigo-400' : 'text-slate-200'}`}>{step.title}</h4>
                      <p className="text-[11px] text-slate-400 mt-1 font-normal leading-relaxed">{step.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Master Info Block */}
          <div className="bg-indigo-950/30 border border-indigo-500/15 p-4 rounded-2xl flex items-start gap-3">
            <Smartphone className="text-indigo-400 shrink-0 mt-0.5" size={20} />
            <div>
              <h5 className="text-xs font-bold text-indigo-400">Lock Verification Safety Tips:</h5>
              <ul className="text-[11px] text-slate-300 space-y-1 list-disc pl-4 mt-1 leading-relaxed">
                <li>Always ensure the lock turns <strong>Green</strong> before trying to depress the lever handle.</li>
                <li>If the lock flashes <strong>Red</strong>, you typed a wrong code. Simply wait 3 seconds for the screen to clear and key in again.</li>
                <li>Your key code is active starting <strong>exactly at Check-in (12:00 PM)</strong>.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
