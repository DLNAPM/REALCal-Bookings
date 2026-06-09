import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Shield, Video, CheckCircle, Smartphone } from 'lucide-react';

interface YamiryLockGuideProps {
  accessCode?: string;
  roomLockNumber?: string;
}

export const YamiryLockGuide: React.FC<YamiryLockGuideProps> = ({ accessCode, roomLockNumber }) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [progress, setProgress] = useState<number>(0); // 0 to 100
  const [activeStep, setActiveStep] = useState<number>(0); // 0: Enter Code + Logo, 1: Green Indicator, 2: Turn Knob
  const [isMuted, setIsMuted] = useState<boolean>(true);
  
  // Custom states for lock simulation
  const [isKeypadLit, setIsKeypadLit] = useState<boolean>(false);
  const [inputDigits, setInputDigits] = useState<string[]>([]);
  const [activeDigitIndex, setActiveDigitIndex] = useState<number>(-1);
  const [indicatorColor, setIndicatorColor] = useState<'none' | 'blue' | 'green' | 'red'>('none');
  const [knobAngle, setKnobAngle] = useState<number>(0);
  const [isDoorOpen, setIsDoorOpen] = useState<boolean>(false);

  // Auto playback loop simulation
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const displayCode = accessCode || "3348"; // Placeholder code if none provided
  const digitsToPress = [...displayCode.split(''), 'YAMIRY'];

  const steps = [
    {
      title: "1. Enter Access Code + Logo",
      desc: `Carefully type your code (${displayCode}) and press the 'YAMIRY' symbol right between the keys and the door knob.`,
    },
    {
      title: "2. Wait for the Green Indicator",
      desc: "The smart lock verifies the code. The 'YAMIRY' symbol turns bright green with a verification chime.",
    },
    {
      title: "3. Turn knob left or right & Open",
      desc: "Turn knob left or right and push to open the door. Re-locks automatically in 5 seconds.",
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
            setKnobAngle(0);
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
      setKnobAngle(0);
      setIsDoorOpen(false);
      setActiveDigitIndex(-1);
    } else if (progress >= 15 && progress < 25) {
      // Touch screen, wake-up
      setActiveStep(0);
      setIsKeypadLit(true);
      setIndicatorColor('none');
      setKnobAngle(0);
      setIsDoorOpen(false);
      setInputDigits([]);
      setActiveDigitIndex(-1);
      if (progress === 15) {
        playBeep(440, 0.1); // awake beep
      }
    } else if (progress >= 25 && progress < 75) {
      // Typing sequence
      setActiveStep(0);
      setIsKeypadLit(true);
      setIndicatorColor('none');
      setKnobAngle(0);
      setIsDoorOpen(false);

      // Map progress to pressing key indices
      const codeProgressSpan = 75 - 25; // 50% progress scope
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
              if (pressedDigit === 'YAMIRY') {
                playBeep(880, 0.15, 'sine'); // confirm pressed
              } else {
                playBeep(523.25, 0.08, 'sine'); // number beep
              }
              return res;
            }
            return prev;
          });
        }
      }
    } else if (progress >= 75 && progress < 87) {
      // Success Verification (YAMIRY symbol glows Green)
      setActiveStep(1);
      setIsKeypadLit(true);
      if (indicatorColor !== 'green') {
        setIndicatorColor('green');
        playBeep(987.77, 0.15, 'sine');
        setTimeout(() => playBeep(1318.51, 0.25, 'sine'), 100);
      }
      setKnobAngle(0);
      setIsDoorOpen(false);
      setActiveDigitIndex(-1);
    } else if (progress >= 87 && progress < 98) {
      // Handle rotating knob list
      setActiveStep(2);
      setIsKeypadLit(true);
      setIndicatorColor('green');
      setKnobAngle(65); // Rotate knob by 65 degrees
      setIsDoorOpen(true);
      setActiveDigitIndex(-1);
    } else {
      // Returning, resetting
      setIsKeypadLit(false);
      setKnobAngle(0);
      setIsDoorOpen(false);
      setIndicatorColor('none');
    }
  }, [progress]);

  const handleSeek = (value: number) => {
    setProgress(value);
  };

  const handleStepClick = (stepIndex: number) => {
    if (stepIndex === 0) setProgress(25);
    if (stepIndex === 1) setProgress(76);
    if (stepIndex === 2) setProgress(88);
  };

  const isYAMIRYPressed = digitsToPress[activeDigitIndex] === 'YAMIRY';

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-6 md:p-8 text-white max-w-4xl mx-auto my-8 font-sans">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-5">
        <div>
          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider inline-flex items-center gap-1.5 mb-2">
            <Video size={12} className="animate-pulse" /> Animated Video Guide
          </span>
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">How to Open the YAMIRY Smart Lock</h2>
          <p className="text-slate-400 text-sm mt-1">Watch this interactive step-by-step animated guide to operate your room lock knob.</p>
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
            {/* SVG simulation of the beautiful black YAMIRY smart knob lock */}
            <svg width="220" height="300" viewBox="0 0 220 300" fill="none" className="drop-shadow-2xl">
              {/* Outer plate shadow/frame */}
              <rect x="70" y="20" width="80" height="260" rx="40" fill="#0d1117" stroke="#21262d" strokeWidth="4" />
              <rect x="74" y="24" width="72" height="252" rx="36" fill="#161b22" />

              {/* Touch Keypad Face Plate (2 rows of numbers, 1-9, then 0 key space) */}
              <rect x="80" y="45" width="60" height="52" rx="8" fill="#090d11" stroke="#30363d" />

              {/* Interactive Keypad Numbers inside SVG (2 rows of numbers: 1-5, and 6-0) */}
              {Array.from({ length: 2 }).map((_, rIdx) => {
                const rowKeys = [
                  ['1', '2', '3', '4', '5'],
                  ['6', '7', '8', '9', '0']
                ][rIdx];

                return rowKeys.map((key, cIdx) => {
                  const x = 90 + (cIdx * 10);
                  const y = 58 + (rIdx * 24);
                  const isBeingPressedKey = digitsToPress[activeDigitIndex] === key;
                  
                  return (
                    <g key={key}>
                      {/* Glow background if key is active / being pressed */}
                      {isKeypadLit && (
                        <circle cx={x} cy={y} r="4" fill="#6366f1" fillOpacity={isBeingPressedKey ? "0.8" : "0.1"} className="transition-all duration-200" />
                      )}
                      <text 
                        x={x} 
                        y={y + 1.8} 
                        fontSize="6" 
                        fontFamily="monospace" 
                        fontWeight="bold" 
                        textAnchor="middle" 
                        fill={
                          isBeingPressedKey ? '#ffffff' :
                          isKeypadLit ? '#a5b4fc' : '#4b5563'
                        }
                        className="transition-colors duration-200 select-none animate-duration-150"
                      >
                        {key}
                      </text>
                    </g>
                  );
                });
              })}

              {/* YAMIRY Symbol Button right between the keys and the door knob */}
              <g transform="translate(110, 122)">
                <rect 
                  x="-32" 
                  y="-10" 
                  width="64" 
                  height="20" 
                  rx="10" 
                  fill={indicatorColor === 'green' ? '#064e3b' : isYAMIRYPressed ? '#312e81' : '#0f172a'} 
                  stroke={indicatorColor === 'green' ? '#10b981' : isYAMIRYPressed ? '#818cf8' : '#334155'} 
                  strokeWidth="1.5"
                  className="transition-all duration-300"
                />
                {/* Backlit Glow effect */}
                {(indicatorColor === 'green' || isYAMIRYPressed) && (
                  <rect 
                    x="-34" 
                    y="-12" 
                    width="68" 
                    height="24" 
                    rx="12" 
                    fill={indicatorColor === 'green' ? '#10b981' : '#6366f1'} 
                    fillOpacity="0.15" 
                    className="animate-pulse" 
                  />
                )}
                {/* Word YAMIRY as the symbol button */}
                <text 
                  x="0" 
                  y="3" 
                  fontSize="7.5" 
                  fontFamily="sans-serif" 
                  fontWeight="900" 
                  letterSpacing="1"
                  textAnchor="middle" 
                  fill={indicatorColor === 'green' ? '#34d399' : isYAMIRYPressed ? '#ffffff' : '#64748b'}
                  className="transition-colors duration-300 select-none"
                >
                  YAMIRY
                </text>
              </g>

              {/* Custom Typed Code Text Box visualizer inside smart lock screen */}
              {isKeypadLit && (
                <g>
                  <rect x="90" y="148" width="40" height="7" rx="1.5" fill="#000" stroke="#21262d" />
                  <text x="110" y="153.5" fontSize="4.5" fontFamily="monospace" fill="#38bdf8" textAnchor="middle" fontWeight="black tracking-widest">
                    {inputDigits.map(d => d === 'YAMIRY' ? '' : d).join('') || "------"}
                  </text>
                </g>
              )}

              {/* Rotatable Circular Door Knob (smart knob instead of lever) */}
              <g transform={`translate(110, 215) rotate(${knobAngle})`} className="transition-transform duration-350">
                {/* Knob outer plate */}
                <circle cx="0" cy="0" r="32" fill="#2d3748" stroke="#4a5568" strokeWidth="3" />
                {/* Dial ridges to look like a premium gripper knob */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i * 30) * Math.PI / 180;
                  const x1 = Math.cos(angle) * 28;
                  const y1 = Math.sin(angle) * 28;
                  const x2 = Math.cos(angle) * 31;
                  const y2 = Math.sin(angle) * 31;
                  return (
                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a202c" strokeWidth="2" />
                  );
                })}
                {/* Knob face */}
                <circle cx="0" cy="0" r="26" fill="#1a202c" stroke="#2d3748" strokeWidth="1" />
                {/* Horizontal bar grip on the knob that turns visually when rotated */}
                <rect x="-18" y="-4" width="36" height="8" rx="4" fill="#4a5568" stroke="#1a202c" strokeWidth="1" />
                <circle cx="0" cy="0" r="4" fill="#a0aec0" />
              </g>

              {/* Finger pointer simulator that flies into the plate */}
              {activeStep === 0 && progress > 5 && (
                <g transform={
                  activeDigitIndex === 4 
                    ? "translate(110, 122)" // points at YAMIRY logo
                    : `translate(${90 + (Math.max(0, activeDigitIndex) % 5) * 10}, ${58 + Math.floor(Math.max(0, activeDigitIndex) / 5) * 24})` // points at row keys
                } className="animate-pulse">
                  <circle cx="0" cy="0" r="14" fill="#6366f1" fillOpacity="0.2" />
                  <circle cx="0" cy="0" r="6" fill="#6366f1" fillOpacity="0.4" />
                  <circle cx="0" cy="0" r="2" fill="#ffffff" />
                </g>
              )}
            </svg>

            {/* Simulated cracked door open image display backdrop */}
            {isDoorOpen && (
              <div className="absolute inset-0 bg-indigo-950/20 pointer-events-none border border-emerald-500 rounded-2xl flex items-center justify-center animate-pulse z-0 mb-14">
                <div className="bg-emerald-950/90 text-emerald-400 border border-emerald-500/30 font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-sm">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                  KNOB UNLOCKED: Turn & Push Door!
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
                  className="bg-indigo-600 hover:bg-indigo-500 text-white p-2.5 rounded-xl transition-all shadow-md shadow-indigo-500/20 flex items-center justify-center"
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
                <li>Your key code is active starting <strong>exactly at Check-in (04:00 PM)</strong>.</li>
                <li><strong>Locking the Front Door Deadbolt:</strong> When locking the deadbolt on the front door, press any key for 3-4 seconds, then press the <strong>YAMIRY</strong> key.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
