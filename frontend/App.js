import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  TextInput, 
  ScrollView, 
  Alert,
  FlatList,
  Linking
} from 'react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';

export default function App() {
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [currentPage, setCurrentPage] = useState('record'); // 'record', 'notes', 'insights', 'chat', 'calendar'
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [insights, setInsights] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [dynamicInfo, setDynamicInfo] = useState(null);
  const [isLoadingDynamicInfo, setIsLoadingDynamicInfo] = useState(false);
  const [ragContext, setRagContext] = useState([]);
  const [productLinks, setProductLinks] = useState(null);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [noteLinks, setNoteLinks] = useState({}); // Store links for each note

  useEffect(() => {
    loadNotes();
    setupCalendar();
  }, []);

  // Auto-generate links for notes when they load
  useEffect(() => {
    if (notes.length > 0) {
      generateLinksForAllNotes();
    }
  }, [notes]);

  const generateLinksForAllNotes = async (forceRegenerate = false) => {
    console.log('Starting to generate links for', notes.length, 'notes', forceRegenerate ? '(forced)' : '');
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const noteId = note._id || note.id;
      if (!noteLinks[noteId] || forceRegenerate) {
        try {
          console.log(`Generating links for note ${i + 1}/${notes.length}:`, note.title || note.content?.substring(0, 30));
          const links = await generateLinksForNote(note);
          console.log('Generated links for note:', links);
          
          // Update state with error handling
          try {
            setNoteLinks(prev => {
              const newState = {
                ...prev,
                [noteId]: links
              };
              console.log('Updated noteLinks state for note:', noteId);
              return newState;
            });
          } catch (stateError) {
            console.error('Failed to update state for note:', noteId, stateError);
          }
          
          // Add delay between API calls to avoid overwhelming the server
          if (i < notes.length - 1) {
            console.log('Waiting 2 seconds before next API call...');
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          console.error('Failed to generate links for note:', error);
        }
      } else {
        console.log('Links already exist for note:', noteId);
      }
    }
    console.log('Finished generating links for all notes');
  };

  const setupCalendar = async () => {
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') {
        console.log('Calendar permission not granted');
      }
    } catch (error) {
      console.log('Calendar setup failed:', error);
    }
  };

  const API_BASE_URL = 'http://192.168.10.131:5000/api';
  const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;

  // Sync local notes with backend when connection is restored
  const syncLocalNotesWithBackend = async () => {
    try {
      const localNotes = await AsyncStorage.getItem('notes');
      if (!localNotes) return;

      const parsedLocalNotes = JSON.parse(localNotes);
      if (parsedLocalNotes.length === 0) return;

      console.log('Syncing', parsedLocalNotes.length, 'local notes with backend...');
      
      for (const note of parsedLocalNotes) {
        try {
          const response = await fetch(`${API_BASE_URL}/notes`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              title: note.text ? note.text.substring(0, 50) + '...' : note.title,
              content: note.text || note.content,
              extractedInfo: note.extractedInfo,
              reminders: note.reminders,
              audioTranscription: note.audioTranscription
            }),
          });

          if (response.ok) {
            console.log('Synced note:', note.title || note.text?.substring(0, 30));
          }
        } catch (error) {
          console.log('Failed to sync note:', error.message);
        }
      }

      // Clear local storage after successful sync
      await AsyncStorage.removeItem('notes');
      console.log('Local notes synced and cleared');
    } catch (error) {
      console.log('Error syncing local notes:', error);
    }
  };

  const loadNotes = async () => {
    try {
      // Try to load from backend first with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${API_BASE_URL}/notes`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const backendNotes = await response.json();
        setNotes(backendNotes);
        console.log('Notes loaded from backend:', backendNotes.length);
        
        // Try to sync any local notes with backend
        await syncLocalNotesWithBackend();
        return;
      } else {
        console.log('Backend responded with error:', response.status);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Backend request timed out, trying local storage');
      } else {
        console.log('Backend not available, trying local storage:', error.message);
      }
    }

    // Fallback to local storage
    try {
      const savedNotes = await AsyncStorage.getItem('notes');
      if (savedNotes) {
        const parsedNotes = JSON.parse(savedNotes);
        setNotes(parsedNotes);
        console.log('Notes loaded from local storage:', parsedNotes.length);
      } else {
        console.log('No notes found in local storage');
        setNotes([]);
      }
    } catch (localError) {
      console.error('Error loading local notes:', localError);
      setNotes([]);
    }
  };

  const saveNotes = async (newNotes) => {
    try {
      // Save to backend with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${API_BASE_URL}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: newNotes.text.substring(0, 50) + '...',
          content: newNotes.text,
          extractedInfo: newNotes.extractedInfo,
          reminders: newNotes.reminders,
          audioTranscription: newNotes.audioTranscription
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const savedNote = await response.json();
        setNotes(prev => [savedNote, ...prev]);
        console.log('Note saved to backend successfully');
        
        // Auto-generate links for the new note
        try {
          const links = await generateLinksForNote(savedNote);
          setNoteLinks(prev => ({
            ...prev,
            [savedNote._id]: links
          }));
        } catch (error) {
          console.log('Failed to generate links for new note:', error);
        }
        
        return;
      } else {
        console.log('Backend save failed with status:', response.status);
        throw new Error('Backend save failed');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Backend save timed out, saving to local storage');
      } else {
        console.log('Error saving to backend:', error.message);
      }
      
      // Fallback to local storage
      try {
        const updatedNotes = [newNotes, ...notes];
        await AsyncStorage.setItem('notes', JSON.stringify(updatedNotes));
        setNotes(updatedNotes);
        console.log('Note saved to local storage successfully');
      } catch (localError) {
        console.error('Error saving locally:', localError);
      }
    }
  };

  const startRecording = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Please enable microphone access');
        return;
      }

      // Set audio mode for recording
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RECORDING_OPTIONS_PRESET_HIGH_QUALITY);
      await recording.startAsync();
      setRecording(recording);
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Recording Error', 'Could not start recording. Please try again.');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;

    setIsRecording(false);
    setIsTranscribing(true);
    
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      // Get real transcription
      const transcribedText = await transcribeAudio(uri);
      if (transcribedText) {
        setCurrentNote(prev => prev + transcribedText + " ");
      }
    } catch (error) {
      console.error('Error in stopRecording:', error);
      Alert.alert('Error', 'Failed to process recording');
    } finally {
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (uri) => {
    try {
      // Use OpenAI Whisper API for automatic transcription
      const transcription = await transcribeWithWhisper(uri);
      return transcription;
      
    } catch (error) {
      console.error('Transcription failed:', error);
      Alert.alert('Transcription Error', 'Could not transcribe audio. Please try again.');
      return '';
    }
  };

  const promptForTranscription = () => {
    return new Promise((resolve) => {
      Alert.prompt(
        'Transcription',
        'Please type what you said:',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve('') },
          { text: 'OK', onPress: (text) => resolve(text || '') }
        ],
        'plain-text'
      );
    });
  };

  // Example: Google Speech-to-Text implementation
  const transcribeWithGoogle = async (uri) => {
    const formData = new FormData();
    formData.append('audio', {
      uri: uri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    });

    const response = await fetch('https://speech.googleapis.com/v1/speech:recognize?key=YOUR_API_KEY', {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    const result = await response.json();
    return result.results?.[0]?.alternatives?.[0]?.transcript || '';
  };

  // OpenAI Whisper implementation
  const transcribeWithWhisper = async (uri) => {

    const formData = new FormData();
    formData.append('file', {
      uri: uri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    });
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // Optional: specify language for better accuracy

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const result = await response.json();
    return result.text || '';
  };

  const saveNote = async () => {
    if (!currentNote.trim()) return;

    const newNote = {
      id: Date.now().toString(),
      text: currentNote,
      timestamp: new Date().toISOString(),
      extractedInfo: extractInformation(currentNote),
      reminders: extractDatesAndTimes(currentNote),
      audioTranscription: null
    };

    await saveNotes(newNote);
    setCurrentNote('');

    // Schedule reminders if any dates were found
    if (newNote.reminders.length > 0) {
      scheduleReminders(newNote);
    }

    Alert.alert('Note saved!', 'Your note has been saved with smart features enabled.');
  };

  const extractInformation = (text) => {
    // Simple information extraction (in a real app, you'd use AI/ML)
    const info = {
      people: [],
      topics: [],
      actions: []
    };

    // Extract people (simple pattern matching)
    const peoplePattern = /(?:with|meeting|call|talk to)\s+([A-Z][a-z]+)/gi;
    const peopleMatches = text.match(peoplePattern);
    if (peopleMatches) {
      info.people = peopleMatches.map(match => match.split(' ').pop());
    }

    // Extract topics
    const topicKeywords = ['project', 'meeting', 'appointment', 'deadline', 'report', 'birthday'];
    info.topics = topicKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );

    // Extract actions
    const actionKeywords = ['buy', 'call', 'finish', 'meeting', 'appointment'];
    info.actions = actionKeywords.filter(keyword => 
      text.toLowerCase().includes(keyword)
    );

    return info;
  };

  const extractDatesAndTimes = (text) => {
    const reminders = [];
    
    // Enhanced date/time extraction patterns
    const patterns = [
      // Tomorrow patterns
      { pattern: /tomorrow at (\d{1,2}):?(\d{2})?\s*(AM|PM)?/gi, offset: 1, timeMatch: true },
      { pattern: /tomorrow/gi, offset: 1, timeMatch: false },
      
      // Next week patterns
      { pattern: /next (\w+) at (\d{1,2}):?(\d{2})?\s*(AM|PM)?/gi, offset: 7, timeMatch: true },
      { pattern: /next (\w+)/gi, offset: 7, timeMatch: false },
      
      // Time patterns (today)
      { pattern: /at (\d{1,2}):(\d{2})\s*(AM|PM)/gi, offset: 0, timeMatch: true },
      { pattern: /(\d{1,2}):(\d{2})\s*(AM|PM)/gi, offset: 0, timeMatch: true },
      
      // Date patterns
      { pattern: /(\d{1,2})\/(\d{1,2})\/(\d{4})/gi, offset: 0, timeMatch: false },
      { pattern: /(\d{1,2})\/(\d{1,2})/gi, offset: 0, timeMatch: false },
      
      // Day of week patterns
      { pattern: /(monday|tuesday|wednesday|thursday|friday|saturday|sunday) at (\d{1,2}):?(\d{2})?\s*(AM|PM)?/gi, offset: 0, timeMatch: true },
      { pattern: /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, offset: 0, timeMatch: false }
    ];

    patterns.forEach(({ pattern, offset, timeMatch }) => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const date = new Date();
          
          // Handle different date offsets
          if (offset > 0) {
            date.setDate(date.getDate() + offset);
          }
          
          // Set time if specified
          if (timeMatch) {
            const timeMatch = match.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);
            if (timeMatch) {
              let hours = parseInt(timeMatch[1]);
              const minutes = parseInt(timeMatch[2]) || 0;
              const ampm = timeMatch[3]?.toUpperCase();
              
              if (ampm === 'PM' && hours !== 12) hours += 12;
              if (ampm === 'AM' && hours === 12) hours = 0;
              
              date.setHours(hours, minutes, 0, 0);
            }
          }
          
          reminders.push({
            text: match,
            date: date.toISOString(),
            originalText: text
          });
        });
      }
    });

    return reminders;
  };

  const scheduleReminders = async (note) => {
    try {
      if (note.reminders && note.reminders.length > 0) {
        await addToCalendar(note);
        Alert.alert('Calendar Updated!', `Added ${note.reminders.length} events to your calendar!`);
      }
    } catch (error) {
      console.error('Calendar integration failed:', error);
      Alert.alert('Calendar Error', 'Could not add events to calendar. Please check permissions.');
    }
  };

  const addToCalendar = async (note) => {
    try {
      // Get default calendar
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      const defaultCalendar = calendars.find(cal => cal.allowsModifications) || calendars[0];
      
      if (!defaultCalendar) {
        throw new Error('No writable calendar found');
      }

      // Add each reminder as a calendar event
      for (const reminder of note.reminders) {
        const eventDate = new Date(reminder.date);
        const endDate = new Date(eventDate.getTime() + (60 * 60 * 1000)); // 1 hour duration

        // Create event title from topics and people
        const topics = note.extractedInfo?.topics?.join(', ') || 'Note';
        const people = note.extractedInfo?.people?.join(', ') || '';
        const title = people ? `${topics} with ${people}` : topics;

        // Create event details
        const eventDetails = {
          title: title,
          startDate: eventDate,
          endDate: endDate,
          notes: `From Noteable: ${note.content || note.text}\n\nOriginal reminder: ${reminder.text}`,
          location: note.extractedInfo?.locations?.join(', ') || '',
          alarms: [{ relativeOffset: -30, method: Calendar.AlarmMethod.ALERT }], // 30 min before
        };

        await Calendar.createEventAsync(defaultCalendar.id, eventDetails);
      }
    } catch (error) {
      console.error('Error adding to calendar:', error);
      throw error;
    }
  };

  // RAG (Retrieval-Augmented Generation) Function
  const searchRelevantNotes = (query) => {
    if (!notes || notes.length === 0) return [];
    
    const queryLower = query.toLowerCase();
    const relevantNotes = [];
    
    notes.forEach(note => {
      const content = (note.content || note.text || '').toLowerCase();
      const extractedInfo = note.extractedInfo || {};
      
      // Check for direct keyword matches
      const keywords = queryLower.split(' ').filter(word => word.length > 2);
      let relevanceScore = 0;
      
      keywords.forEach(keyword => {
        if (content.includes(keyword)) relevanceScore += 2;
        if (extractedInfo.people && extractedInfo.people.some(person => 
          person.toLowerCase().includes(keyword))) relevanceScore += 3;
        if (extractedInfo.topics && extractedInfo.topics.some(topic => 
          topic.toLowerCase().includes(keyword))) relevanceScore += 2;
        if (extractedInfo.actions && extractedInfo.actions.some(action => 
          action.toLowerCase().includes(keyword))) relevanceScore += 1;
      });
      
      // Check for semantic similarity (simple word overlap)
      const contentWords = content.split(' ');
      const queryWords = queryLower.split(' ');
      const commonWords = contentWords.filter(word => 
        queryWords.includes(word) && word.length > 3);
      relevanceScore += commonWords.length;
      
      if (relevanceScore > 0) {
        relevantNotes.push({
          ...note,
          relevanceScore,
          matchedKeywords: keywords.filter(keyword => content.includes(keyword))
        });
      }
    });
    
    // Sort by relevance and return top 5 most relevant notes
    return relevantNotes
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  };

  // Enhanced AI Chat Function with RAG
  const askAI = async (question) => {
    try {
      // Search for relevant notes using RAG
      const relevantNotes = searchRelevantNotes(question);
      setRagContext(relevantNotes);
      
      // Build context from relevant notes
      let contextString = '';
      if (relevantNotes.length > 0) {
        contextString = '\n\nRelevant kontext från dina anteckningar:\n';
        relevantNotes.forEach((note, index) => {
          contextString += `${index + 1}. ${note.content || note.text}\n`;
          if (note.extractedInfo) {
            if (note.extractedInfo.people?.length > 0) {
              contextString += `   Personer: ${note.extractedInfo.people.join(', ')}\n`;
            }
            if (note.extractedInfo.topics?.length > 0) {
              contextString += `   Ämnen: ${note.extractedInfo.topics.join(', ')}\n`;
            }
            if (note.extractedInfo.actions?.length > 0) {
              contextString += `   Åtgärder: ${note.extractedInfo.actions.join(', ')}\n`;
            }
          }
          contextString += '\n';
        });
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Du är en intelligent AI-assistent som hjälper användaren baserat på deras anteckningar. Du har tillgång till relevant kontext från användarens tidigare anteckningar.

Använd denna kontext för att ge mer relevanta och personliga svar. Om kontexten innehåller relevant information, referera till den. Om inte, svara baserat på din allmänna kunskap.

Svara alltid på svenska och var konkret, användbar och personlig.`
            },
            {
              role: 'user',
              content: question + contextString
            }
          ],
          max_tokens: 800,
          temperature: 0.7
        })
      });

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('AI chat error:', error);
      return 'Tyvärr kunde jag inte svara på din fråga just nu. Försök igen senare.';
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = {
      id: Date.now(),
      text: chatInput,
      isUser: true,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');

    // Get AI response
    const aiResponse = await askAI(chatInput);
    
    const aiMessage = {
      id: Date.now() + 1,
      text: aiResponse,
      isUser: false,
      timestamp: new Date()
    };

    setChatMessages(prev => [...prev, aiMessage]);
  };

  // Generate links for a specific note with retry logic
  const generateLinksForNote = async (note, retryCount = 0) => {
    console.log('generateLinksForNote called with note:', note.content?.substring(0, 50));
    try {
      if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API key not found');
      }
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Du är en expert på att hitta användbar information och länkar för ALLT som nämns i anteckningarna. 

KRITISKT: Du MÅSTE hitta minst 3-5 relevanta entiteter per anteckning, även om de bara nämns kort!

EXEMPEL - Om anteckningen nämner "Tokyo" så hitta:
- Platser: Tokyo Skytree, Sensoji Temple, Tsukiji Fish Market
- Produkter: JR Pass, Tokyo Metro Card
- Tjänster: Tokyo tours, sushi classes
- Evenemang: Cherry blossom season, Tokyo Game Show

EXEMPEL - Om anteckningen nämner "React" så hitta:
- Tech Stack: React, JavaScript, Node.js
- Resurser: React documentation, React courses
- Tjänster: React development services
- Koncept: Component-based architecture

ALLMÄNNA KATEGORIER:
- Produkter (telefoner, datorer, böcker, kläder, mat, etc.)
- Tjänster (kurser, konsultationer, behandlingar, reparationer)
- Evenemang (konferenser, konserter, utställningar, möten)
- Platser (museer, restauranger, hotell, naturområden, butiker)
- Personer (artister, författare, experter, influenser)
- Organisationer (företag, myndigheter, föreningar, skolor)
- Koncept (tekniker, metoder, teorier, filosofier)
- Aktiviteter (sport, hobby, fritidsaktiviteter)
- Resurser (böcker, artiklar, videor, podcasts, appar)
- Recept (mat, dryck, hantverk, DIY-projekt)

VIKTIGT: Var EXTREMT inkluderande! Hitta minst 3-5 saker per anteckning. Även om något bara nämns i förbigående, kan det ha användbar information att söka upp.

SPECIELL FOKUS PÅ:
- Alla teknologier, programmeringsspråk, ramverk, verktyg (React, Python, Docker, etc.)
- Alla produkter och tjänster som nämns
- Alla platser, även om de bara nämns i förbigående
- Alla personer, även om de bara nämns kort
- Alla koncept och metoder
- Alla aktiviteter och hobbyer
- Alla resurser som böcker, kurser, videor

Tänk som en detektiv - varje ord kan vara en ledtråd till användbar information!

För varje identifierad entitet, skapa en struktur med:
- Namn
- Typ (produkt, tjänst, person, plats, koncept, aktivitet, etc.)
- Föreslagna söktermer för att hitta mer information
- Föreslagna webbplatser/källor att söka på
- Uppskattade priser/avgifter (om nämnt)
- Öppettider/tillgänglighet (om nämnt)
- Ytterligare kontext (vad det används till, varför det nämns)
- Källanteckning

Anteckning: ${note.content}

Returnera JSON med följande struktur:
{
  "products": [
    {
      "name": "iPhone 15 Pro Max",
      "type": "smartphone",
      "searchTerms": ["iPhone 15 Pro Max 256GB", "iPhone 15 Pro Max pris", "iPhone 15 Pro Max köp"],
      "suggestedSites": ["Apple Store", "Elgiganten", "MediaMarkt", "Webhallen"],
      "estimatedPrice": "15999 kr",
      "context": "Behöver köpa ny telefon",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "services": [
    {
      "name": "React Native Course",
      "type": "online course",
      "searchTerms": ["React Native course Udemy", "React Native kurs online"],
      "suggestedSites": ["Udemy", "Coursera", "Pluralsight"],
      "estimatedPrice": "299 kr",
      "context": "Vill lära sig mobilutveckling",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "events": [
    {
      "name": "Tech Conference 2024",
      "type": "conference",
      "searchTerms": ["Tech Conference 2024 Stockholm", "Tech Conference biljetter"],
      "suggestedSites": ["Eventbrite", "techconf.se", "Stockholmsmässan"],
      "estimatedPrice": "2500 kr",
      "context": "Vill hålla presentation om AI",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "places": [
    {
      "name": "Vasa Museum",
      "type": "museum",
      "searchTerms": ["Vasa Museum Stockholm", "Vasa Museum öppettider", "Vasa Museum biljetter"],
      "suggestedSites": ["vasamuseet.se", "Visit Stockholm", "TripAdvisor"],
      "estimatedPrice": "170 kr",
      "openingHours": "10:00-17:00",
      "context": "Vill besöka med familjen",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "people": [
    {
      "name": "Dr. Maria Andersson",
      "type": "läkare",
      "searchTerms": ["Dr Maria Andersson kardiologi", "Maria Andersson Karolinska"],
      "suggestedSites": ["Karolinska Institutet", "1177.se", "Hitta.se"],
      "context": "Specialist inom hjärtmedicin",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "concepts": [
    {
      "name": "Machine Learning",
      "type": "teknik",
      "searchTerms": ["Machine Learning för nybörjare", "ML kurser online", "AI utbildning"],
      "suggestedSites": ["Coursera", "edX", "Kaggle", "YouTube"],
      "context": "Vill lära sig för jobbet",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "activities": [
    {
      "name": "Yoga",
      "type": "träning",
      "searchTerms": ["Yoga för nybörjare", "Yoga klasser Stockholm", "Yoga online"],
      "suggestedSites": ["Yogastudion", "Mindbody", "YouTube Yoga"],
      "context": "För nackspänning och avkoppling",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "resources": [
    {
      "name": "Atomic Habits bok",
      "type": "bok",
      "searchTerms": ["Atomic Habits James Clear", "Atomic Habits svenska", "Atomic Habits sammanfattning"],
      "suggestedSites": ["Adlibris", "Bokus", "Storytel", "Goodreads"],
      "estimatedPrice": "199 kr",
      "context": "Rekommenderad av kollega",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "techStack": [
    {
      "name": "React Native",
      "type": "framework",
      "searchTerms": ["React Native dokumentation", "React Native kurser", "React Native community"],
      "suggestedSites": ["reactnative.dev", "Expo", "GitHub", "Stack Overflow"],
      "context": "Mobilutveckling framework",
      "sourceNote": "Anteckningens innehåll"
    }
  ]
}

Svara BARA med JSON, inget annat.`
            }
          ],
          max_tokens: 2000,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenAI API error:', response.status, errorText);
        
        // Retry on 500 errors (server errors)
        if (response.status >= 500 && retryCount < 3) {
          console.log(`Retrying API call (attempt ${retryCount + 1}/3) after 500 error...`);
          await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1))); // Exponential backoff
          return generateLinksForNote(note, retryCount + 1);
        }
        
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('OpenAI API response:', data);
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('Invalid OpenAI API response structure:', data);
        return { products: [], services: [], events: [], places: [], people: [], concepts: [], activities: [], resources: [], techStack: [] };
      }
      
      const linksText = data.choices[0].message.content;
      console.log('Raw links text:', linksText);
      
      try {
        const parsedLinks = JSON.parse(linksText);
        console.log('Parsed links:', parsedLinks);
        
        // Simplify the data structure to avoid state update issues
        const simplifiedLinks = {
          products: parsedLinks.products || [],
          services: parsedLinks.services || [],
          events: parsedLinks.events || [],
          places: parsedLinks.places || [],
          people: parsedLinks.people || [],
          concepts: parsedLinks.concepts || [],
          activities: parsedLinks.activities || [],
          resources: parsedLinks.resources || [],
          techStack: parsedLinks.techStack || []
        };
        
        console.log('Simplified links:', simplifiedLinks);
        return simplifiedLinks;
      } catch (parseError) {
        console.error('Failed to parse links JSON:', parseError);
        console.error('Raw text that failed to parse:', linksText);
        return { products: [], services: [], events: [], places: [], people: [], concepts: [], activities: [], resources: [], techStack: [] };
      }
    } catch (error) {
      console.error('Error generating links for note:', error);
      
      // If it's a 500 error and we've exhausted retries, return some basic fallback data
      if (error.message.includes('500') && retryCount >= 3) {
        console.log('All retries failed, returning fallback data for note:', note.content?.substring(0, 30));
        return generateFallbackLinks(note);
      }
      
      return { products: [], services: [], events: [], places: [], people: [], concepts: [], activities: [], resources: [], techStack: [] };
    }
  };

  // Fallback function to generate basic links when API fails
  const generateFallbackLinks = (note) => {
    const content = note.content || note.text || '';
    const fallbackLinks = {
      products: [],
      services: [],
      events: [],
      places: [],
      people: [],
      concepts: [],
      activities: [],
      resources: [],
      techStack: []
    };

    // Simple keyword-based fallback
    if (content.toLowerCase().includes('tokyo')) {
      fallbackLinks.places.push({
        name: 'Tokyo',
        type: 'city',
        searchTerms: ['Tokyo travel guide', 'Tokyo attractions', 'Tokyo hotels'],
        suggestedSites: ['Japan Guide', 'TripAdvisor', 'Booking.com'],
        context: 'Mentioned in note',
        sourceNote: content.substring(0, 100)
      });
    }

    if (content.toLowerCase().includes('iphone')) {
      fallbackLinks.products.push({
        name: 'iPhone',
        type: 'smartphone',
        searchTerms: ['iPhone price', 'iPhone comparison', 'iPhone reviews'],
        suggestedSites: ['Apple Store', 'Elgiganten', 'MediaMarkt'],
        context: 'Mentioned in note',
        sourceNote: content.substring(0, 100)
      });
    }

    if (content.toLowerCase().includes('react')) {
      fallbackLinks.techStack.push({
        name: 'React',
        type: 'framework',
        searchTerms: ['React documentation', 'React tutorials', 'React examples'],
        suggestedSites: ['reactjs.org', 'GitHub', 'Stack Overflow'],
        context: 'Mentioned in note',
        sourceNote: content.substring(0, 100)
      });
    }

    console.log('Generated fallback links:', fallbackLinks);
    return fallbackLinks;
  };

  // Generate All Relevant Links for All Notes - Finds products, places, people, tech, concepts, etc.
  const generateAllRelevantLinks = async () => {
    try {
      const allNotes = notes.map(note => ({
        content: note.content || note.text,
        extractedInfo: note.extractedInfo,
        timestamp: note.createdAt || note.timestamp
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Du är en expert på att hitta användbar information och länkar för ALLT som nämns i anteckningarna. Analysera anteckningarna och identifiera ALLA entiteter som kan ha ytterligare information att söka upp:

ALLMÄNNA KATEGORIER:
- Produkter (telefoner, datorer, böcker, kläder, mat, etc.)
- Tjänster (kurser, konsultationer, behandlingar, reparationer)
- Evenemang (konferenser, konserter, utställningar, möten)
- Platser (museer, restauranger, hotell, naturområden, butiker)
- Personer (artister, författare, experter, influenser)
- Organisationer (företag, myndigheter, föreningar, skolor)
- Koncept (tekniker, metoder, teorier, filosofier)
- Aktiviteter (sport, hobby, fritidsaktiviteter)
- Resurser (böcker, artiklar, videor, podcasts, appar)
- Recept (mat, dryck, hantverk, DIY-projekt)

VIKTIGT: Var mycket mer inkluderande och hitta fler saker! Tänk kreativt och identifiera så många entiteter som möjligt. Även om något bara nämns kort, kan det ha användbar information att söka upp.

SPECIELL FOKUS PÅ:
- Alla teknologier, programmeringsspråk, ramverk, verktyg (React, Python, Docker, etc.)
- Alla produkter och tjänster som nämns
- Alla platser, även om de bara nämns i förbigående
- Alla personer, även om de bara nämns kort
- Alla koncept och metoder
- Alla aktiviteter och hobbyer
- Alla resurser som böcker, kurser, videor

Tänk som en detektiv - varje ord kan vara en ledtråd till användbar information!

För varje identifierad entitet, skapa en struktur med:
- Namn
- Typ (produkt, tjänst, person, plats, koncept, aktivitet, etc.)
- Föreslagna söktermer för att hitta mer information
- Föreslagna webbplatser/källor att söka på
- Uppskattade priser/avgifter (om nämnt)
- Öppettider/tillgänglighet (om nämnt)
- Ytterligare kontext (vad det används till, varför det nämns)
- Källanteckning

Anteckningar: ${JSON.stringify(allNotes)}

Returnera JSON med följande struktur:
{
  "products": [
    {
      "name": "iPhone 15 Pro Max",
      "type": "smartphone",
      "searchTerms": ["iPhone 15 Pro Max 256GB", "iPhone 15 Pro Max pris", "iPhone 15 Pro Max köp"],
      "suggestedSites": ["Apple Store", "Elgiganten", "MediaMarkt", "Webhallen"],
      "estimatedPrice": "15999 kr",
      "context": "Behöver köpa ny telefon",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "services": [
    {
      "name": "React Native Course",
      "type": "online course",
      "searchTerms": ["React Native course Udemy", "React Native kurs online"],
      "suggestedSites": ["Udemy", "Coursera", "Pluralsight"],
      "estimatedPrice": "299 kr",
      "context": "Vill lära sig mobilutveckling",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "events": [
    {
      "name": "Tech Conference 2024",
      "type": "conference",
      "searchTerms": ["Tech Conference 2024 Stockholm", "Tech Conference biljetter"],
      "suggestedSites": ["Eventbrite", "techconf.se", "Stockholmsmässan"],
      "estimatedPrice": "2500 kr",
      "context": "Vill hålla presentation om AI",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "places": [
    {
      "name": "Vasa Museum",
      "type": "museum",
      "searchTerms": ["Vasa Museum Stockholm", "Vasa Museum öppettider", "Vasa Museum biljetter"],
      "suggestedSites": ["vasamuseet.se", "Visit Stockholm", "TripAdvisor"],
      "estimatedPrice": "170 kr",
      "openingHours": "10:00-17:00",
      "context": "Vill besöka med familjen",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "people": [
    {
      "name": "Dr. Maria Andersson",
      "type": "läkare",
      "searchTerms": ["Dr Maria Andersson kardiologi", "Maria Andersson Karolinska"],
      "suggestedSites": ["Karolinska Institutet", "1177.se", "Hitta.se"],
      "context": "Specialist inom hjärtmedicin",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "concepts": [
    {
      "name": "Machine Learning",
      "type": "teknik",
      "searchTerms": ["Machine Learning för nybörjare", "ML kurser online", "AI utbildning"],
      "suggestedSites": ["Coursera", "edX", "Kaggle", "YouTube"],
      "context": "Vill lära sig för jobbet",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "activities": [
    {
      "name": "Yoga",
      "type": "träning",
      "searchTerms": ["Yoga för nybörjare", "Yoga klasser Stockholm", "Yoga online"],
      "suggestedSites": ["Yogastudion", "Mindbody", "YouTube Yoga"],
      "context": "För nackspänning och avkoppling",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "resources": [
    {
      "name": "Atomic Habits bok",
      "type": "bok",
      "searchTerms": ["Atomic Habits James Clear", "Atomic Habits svenska", "Atomic Habits sammanfattning"],
      "suggestedSites": ["Adlibris", "Bokus", "Storytel", "Goodreads"],
      "estimatedPrice": "199 kr",
      "context": "Rekommenderad av kollega",
      "sourceNote": "Anteckningens innehåll"
    }
  ],
  "techStack": [
    {
      "name": "React Native",
      "type": "framework",
      "searchTerms": ["React Native dokumentation", "React Native kurser", "React Native community"],
      "suggestedSites": ["reactnative.dev", "Expo", "GitHub", "Stack Overflow"],
      "context": "Mobilutveckling framework",
      "sourceNote": "Anteckningens innehåll"
    }
  ]
}

Svara BARA med JSON, inget annat.`
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        })
      });

      const data = await response.json();
      const linksText = data.choices[0].message.content;
      
      try {
        return JSON.parse(linksText);
      } catch (parseError) {
        console.error('Failed to parse product links JSON:', parseError);
        return { products: [], services: [], events: [], places: [], people: [], concepts: [], activities: [], resources: [], techStack: [] };
      }
    } catch (error) {
      console.error('Error searching product links:', error);
      return { products: [], services: [], events: [], places: [], people: [], concepts: [], activities: [], resources: [], techStack: [] };
    }
  };

  // Dynamic Information Extraction - Intelligently finds and categorizes information
  const extractDynamicInfo = async () => {
    try {
      const allNotes = notes.map(note => ({
        content: note.content || note.text,
        extractedInfo: note.extractedInfo,
        timestamp: note.createdAt || note.timestamp
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Du är en intelligent informationsanalysator som automatiskt identifierar och kategoriserar olika typer av information från text. Analysera anteckningarna och hitta alla relevanta entiteter som kan ha ytterligare information att söka upp.

Kategorisera informationen i följande grupper:

**FÖRETAG & PLATSER:**
- Företag, butiker, restauranger, shoppingcenter, hotell
- Adress, telefon, hemsida, öppettider, recensioner

**PERSONER & KONTAKTER:**
- Namn, titel, företag, kontaktuppgifter
- Sociala medier, LinkedIn, email, telefon

**EVENT & AKTIVITETER:**
- Evenemang, konferenser, möten, träningar, konserter
- Datum, tid, plats, biljetter, priser

**PRODUKTER & TJÄNSTER:**
- Produkter, tjänster, märken, modeller, appar
- Priser, specifikationer, recensioner, alternativ

**PLATSER & RESOR:**
- Restauranger, hotell, turistattraktioner, museer
- Adresser, öppettider, recensioner, priser, väder

**UTBILDNING & KURSER:**
- Kurser, utbildningar, certifieringar, workshops
- Skolor, lärare, datum, kostnad, innehåll

**HÄLSA & VÅRD:**
- Läkare, sjukhus, kliniker, behandlingar, mediciner
- Adresser, telefon, öppettider, specialisering

**TEKNOLOGI & VERKTYG:**
- Programmeringsspråk: JavaScript, Python, Java, C++, TypeScript, Go, Rust, PHP, Ruby, Swift, Kotlin
- Frameworks: React, React Native, Vue.js, Angular, Node.js, Express, Django, Flask, Spring Boot, Laravel
- Databaser: MongoDB, MySQL, PostgreSQL, Redis, Firebase, Supabase, SQLite
- Cloud-plattformar: AWS, Google Cloud, Azure, Heroku, Vercel, Netlify
- Utvecklingsverktyg: VS Code, Git, GitHub, Docker, Kubernetes, Jenkins, Figma, Adobe XD
- API:er och tjänster: Stripe, SendGrid, Twilio, OpenAI, Google Maps API
- Mobilutveckling: Expo, Flutter, Xamarin, Ionic, Cordova
- Funktioner, priser, alternativ, dokumentation

**KULTUR & UNDERHÅLLNING:**
- Filmer, böcker, musik, spel, evenemang
- Recensioner, priser, tillgänglighet, streaming

För varje kategori, extrahera relevanta detaljer och källanteckning. 

VIKTIGT för TEKNOLOGI & VERKTYG:
- Identifiera ALLA teknologier som nämns, även om de bara nämns en gång
- Inkludera både specifika namn (React Native, MongoDB) och generiska termer (databas, framework)
- För varje teknologi, försök att extrahera kontext (vad den används till, varför den nämns)
- Gruppera relaterade teknologier (t.ex. React Native + Expo + JavaScript som en tech stack)

Returnera endast en JSON-objekt med kategorier som arrays.

Anteckningar: ${JSON.stringify(allNotes)}

Returnera JSON med följande struktur:
{
  "companies": [{"name": "Mall of Scandinavia", "type": "shopping center", "address": "...", "phone": "...", "website": "...", "description": "...", "openingHours": "...", "sourceNote": "..."}],
  "people": [{"name": "Anna Svensson", "title": "Projektledare", "company": "...", "contact": "...", "sourceNote": "..."}],
  "events": [{"name": "Tech Conference 2024", "date": "2024-03-15", "location": "...", "tickets": "...", "sourceNote": "..."}],
  "products": [{"name": "iPhone 15", "type": "smartphone", "price": "...", "specifications": "...", "sourceNote": "..."}],
  "places": [{"name": "Vasa Museum", "type": "museum", "address": "...", "openingHours": "...", "sourceNote": "..."}],
  "education": [{"name": "React Native Course", "provider": "...", "duration": "...", "cost": "...", "sourceNote": "..."}],
  "health": [{"name": "Dr. Andersson", "specialty": "Kardiologi", "clinic": "...", "phone": "...", "sourceNote": "..."}],
  "technology": [
    {"name": "React Native", "type": "mobile framework", "features": "Cross-platform development", "context": "Used for building e-commerce app", "sourceNote": "..."},
    {"name": "MongoDB", "type": "database", "features": "NoSQL document database", "context": "Backend database for app", "sourceNote": "..."},
    {"name": "Figma", "type": "design tool", "features": "Collaborative design", "pricing": "Gratis plan tillgänglig", "sourceNote": "..."}
  ],
  "culture": [{"name": "Dune 2", "type": "film", "genre": "...", "rating": "...", "sourceNote": "..."}]
}

Svara BARA med JSON, inget annat.`
            }
          ],
          max_tokens: 3000,
          temperature: 0.3
        })
      });

      const data = await response.json();
      const dynamicInfoText = data.choices[0].message.content;
      
      try {
        return JSON.parse(dynamicInfoText);
      } catch (parseError) {
        console.error('Failed to parse dynamic info JSON:', parseError);
        return { 
          companies: [], people: [], events: [], products: [], places: [], 
          education: [], health: [], technology: [], culture: [] 
        };
      }
    } catch (error) {
      console.error('Error extracting dynamic info:', error);
      return { 
        companies: [], people: [], events: [], products: [], places: [], 
        education: [], health: [], technology: [], culture: [] 
      };
    }
  };

  // Advanced Information Extraction
  const analyzeNotesForInsights = async () => {
    try {
      const allNotes = notes.map(note => ({
        content: note.content || note.text,
        extractedInfo: note.extractedInfo,
        timestamp: note.createdAt || note.timestamp
      }));

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `Du är en expert på att analysera anteckningar och extrahera strukturerad information. Analysera följande anteckningar och returnera en JSON-struktur med kategoriserad information:

              Anteckningar: ${JSON.stringify(allNotes)}

              Returnera JSON med följande struktur (inkludera alltid "sourceNote" med anteckningens innehåll):
              {
                "categories": {
                  "technology": {
                    "techstack": [{"name": "React", "description": "JavaScript bibliotek för UI", "sourceNote": "Anteckningens innehåll"}],
                    "tools": [{"name": "VS Code", "description": "Kodredigerare", "sourceNote": "Anteckningens innehåll"}],
                    "languages": [{"name": "JavaScript", "description": "Programmeringsspråk", "sourceNote": "Anteckningens innehåll"}],
                    "frameworks": [{"name": "Express", "description": "Node.js web framework", "sourceNote": "Anteckningens innehåll"}]
                  },
                  "projects": [{"name": "Noteable App", "description": "AI-powered notes app", "status": "active", "sourceNote": "Anteckningens innehåll"}],
                  "meetings": [{"date": "2024-01-15", "topic": "Project planning", "attendees": ["John", "Sarah"], "sourceNote": "Anteckningens innehåll"}],
                  "tasks": [{"task": "Implement calendar integration", "priority": "high", "deadline": "2024-01-20", "sourceNote": "Anteckningens innehåll"}],
                  "learning": [{"topic": "React Native", "progress": "beginner", "resources": ["Official docs"], "sourceNote": "Anteckningens innehåll"}],
                  "ideas": [{"idea": "Voice-to-text feature", "category": "feature", "feasibility": "high", "sourceNote": "Anteckningens innehåll"}],
                  "companies": [{"name": "Mall of Scandinavia", "type": "shopping center", "address": "Hammarby Fabriksväg 39, 120 30 Stockholm", "phone": "+46 8 123 45 67", "website": "https://mallofscandinavia.se", "description": "Stort köpcentrum i Stockholm", "openingHours": "Mån-Fre: 10:00-21:00", "sourceNote": "Anteckningens innehåll"}],
                  "people": [{"name": "Anna Svensson", "title": "Projektledare", "company": "Tech Corp", "contact": "anna@techcorp.se", "sourceNote": "Anteckningens innehåll"}],
                  "events": [{"name": "Tech Conference 2024", "date": "2024-03-15", "location": "Stockholm", "tickets": "https://tickets.com", "sourceNote": "Anteckningens innehåll"}],
                  "products": [{"name": "iPhone 15", "type": "smartphone", "price": "9999 kr", "specifications": "128GB, Pro Max", "sourceNote": "Anteckningens innehåll"}],
                  "places": [{"name": "Vasa Museum", "type": "museum", "address": "Galärvarvsvägen 14, Stockholm", "openingHours": "10:00-17:00", "sourceNote": "Anteckningens innehåll"}],
                  "education": [{"name": "React Native Course", "provider": "Udemy", "duration": "20 timmar", "cost": "299 kr", "sourceNote": "Anteckningens innehåll"}],
                  "health": [{"name": "Dr. Andersson", "specialty": "Kardiologi", "clinic": "Karolinska", "phone": "+46 8 123 45 67", "sourceNote": "Anteckningens innehåll"}],
                  "technology": [
    {"name": "React Native", "type": "mobile framework", "features": "Cross-platform development", "context": "Used for building e-commerce app", "sourceNote": "Anteckningens innehåll"},
    {"name": "MongoDB", "type": "database", "features": "NoSQL document database", "context": "Backend database for app", "sourceNote": "Anteckningens innehåll"},
    {"name": "Figma", "type": "design tool", "features": "Collaborative design", "pricing": "Gratis plan tillgänglig", "sourceNote": "Anteckningens innehåll"}
  ],
                  "culture": [{"name": "Dune 2", "type": "film", "genre": "Sci-Fi", "rating": "8.5/10", "sourceNote": "Anteckningens innehåll"}]
                }
              }

              Svara BARA med JSON, inget annat.`
            }
          ],
          max_tokens: 2000,
          temperature: 0.3
        })
      });

      const data = await response.json();
      const insightsText = data.choices[0].message.content;
      
      try {
        return JSON.parse(insightsText);
      } catch (parseError) {
        console.error('Failed to parse insights JSON:', parseError);
        return { categories: {} };
      }
    } catch (error) {
      console.error('Error analyzing notes:', error);
      return { categories: {} };
    }
  };

  const deleteNote = async (noteId) => {
    try {
      // Try to delete from backend first
      const response = await fetch(`${API_BASE_URL}/notes/${noteId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setNotes(prev => prev.filter(note => note._id !== noteId));
      } else {
        throw new Error('Backend delete failed');
      }
    } catch (error) {
      console.error('Error deleting from backend:', error);
      // Fallback to local deletion
      const updatedNotes = notes.filter(note => note.id !== noteId);
      setNotes(updatedNotes);
      await AsyncStorage.setItem('notes', JSON.stringify(updatedNotes));
    }
  };

  const renderNote = ({ item }) => (
    <View style={styles.noteCard}>
      <Text style={styles.noteText}>{item.content || item.text}</Text>
      <Text style={styles.noteTime}>
        {new Date(item.createdAt || item.timestamp).toLocaleString()}
      </Text>
      
      {/* People Section */}
      {item.extractedInfo && item.extractedInfo.people && item.extractedInfo.people.length > 0 && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>👥 People</Text>
          <View style={styles.tagContainer}>
            {item.extractedInfo.people.map((person, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.infoTag}
                onPress={() => Alert.alert('Person', `Contact: ${person}\nNote: ${item.content || item.text}`)}
              >
                <Text style={styles.tagText}>{person}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      
      {/* Topics Section */}
      {item.extractedInfo && item.extractedInfo.topics && item.extractedInfo.topics.length > 0 && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>📝 Topics</Text>
          <View style={styles.tagContainer}>
            {item.extractedInfo.topics.map((topic, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.infoTag, styles.topicTag]}
                onPress={() => Alert.alert('Topic', `Topic: ${topic}\nRelated to: ${item.content || item.text}`)}
              >
                <Text style={styles.tagText}>{topic}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      
      {/* Actions Section */}
      {item.extractedInfo && item.extractedInfo.actions && item.extractedInfo.actions.length > 0 && (
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>✅ Actions</Text>
          <View style={styles.tagContainer}>
            {item.extractedInfo.actions.map((action, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.infoTag, styles.actionTag]}
                onPress={() => Alert.alert('Action Item', `Action: ${action}\nFrom note: ${item.content || item.text}`)}
              >
                <Text style={styles.tagText}>{action}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      
      {/* Reminders Section */}
      {item.reminders && item.reminders.length > 0 && (
        <View style={styles.infoSection}>
          <View style={styles.reminderHeader}>
            <Text style={styles.sectionTitle}>⏰ Reminders</Text>
            <TouchableOpacity 
              style={styles.calendarButton}
              onPress={() => addToCalendar(item)}
            >
              <Text style={styles.calendarButtonText}>📅 Add to Calendar</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tagContainer}>
            {item.reminders.map((reminder, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.infoTag, styles.reminderTag]}
                onPress={() => Alert.alert(
                  'Reminder Details', 
                  `When: ${new Date(reminder.date).toLocaleString()}\nWhat: ${reminder.text}\nOriginal: ${reminder.originalText}`
                )}
              >
                <Text style={styles.tagText}>
                  {new Date(reminder.date).toLocaleDateString()} - {reminder.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
      
      {/* Auto-generated Links Section */}
      <View style={styles.infoSection}>
        {noteLinks[item._id || item.id] ? (
          <View style={styles.linksContainer}>
            {/* Check if any category has items */}
            {(() => {
              const links = noteLinks[item._id || item.id];
              const hasAnyLinks = (links.products?.length > 0) || 
                                 (links.places?.length > 0) || 
                                 (links.people?.length > 0) || 
                                 (links.techStack?.length > 0) || 
                                 (links.events?.length > 0) || 
                                 (links.services?.length > 0) || 
                                 (links.concepts?.length > 0) || 
                                 (links.activities?.length > 0) || 
                                 (links.resources?.length > 0);
              
              if (!hasAnyLinks) {
                return (
                  <Text style={styles.debugText}>
                    No links found in any category for this note
                  </Text>
                );
              }
              return null;
            })()}
            {noteLinks[item._id || item.id].products && noteLinks[item._id || item.id].products.length > 0 && (
              <View style={styles.linkCategory}>
                <Text style={styles.linkCategoryTitle}>🛍️ Products</Text>
                {noteLinks[item._id || item.id].products.slice(0, 3).map((product, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.linkItem}
                    onPress={() => {
                      // Create clickable links to relevant websites
                      const searchQuery = encodeURIComponent(product.searchTerms?.[0] || product.name);
                      const links = [
                        { name: 'Google Search', url: `https://www.google.com/search?q=${searchQuery}` },
                        { name: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(product.name)}` },
                        { name: 'Amazon', url: `https://www.amazon.com/s?k=${searchQuery}` },
                        { name: 'Elgiganten', url: `https://www.elgiganten.se/search?q=${searchQuery}` }
                      ];
                      
                      Alert.alert(
                        product.name,
                        `Type: ${product.type}\n${product.estimatedPrice ? `Price: ${product.estimatedPrice}\n` : ''}${product.context ? `Context: ${product.context}\n` : ''}\n\nChoose a link to open:`,
                        links.map(link => ({
                          text: link.name,
                          onPress: () => {
                            // Open link in browser
                            Linking.openURL(link.url).catch(err => 
                              Alert.alert('Error', 'Could not open link: ' + err.message)
                            );
                          }
                        }))
                      );
                    }}
                  >
                    <Text style={styles.linkItemText}>{product.name}</Text>
                    {product.estimatedPrice && (
                      <Text style={styles.linkItemPrice}>{product.estimatedPrice}</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            {noteLinks[item._id || item.id].places && noteLinks[item._id || item.id].places.length > 0 && (
              <View style={styles.linkCategory}>
                <Text style={styles.linkCategoryTitle}>📍 Places</Text>
                {noteLinks[item._id || item.id].places.slice(0, 3).map((place, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.linkItem}
                    onPress={() => {
                      // Create clickable links to relevant websites
                      const searchQuery = encodeURIComponent(place.searchTerms?.[0] || place.name);
                      const links = [
                        { name: '🗺️ Visa på karta', url: `https://www.google.com/maps/search/${searchQuery}` },
                        { name: 'Google Search', url: `https://www.google.com/search?q=${searchQuery}` },
                        { name: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(place.name)}` },
                        { name: 'TripAdvisor', url: `https://www.tripadvisor.com/Search?q=${searchQuery}` }
                      ];
                      
                      Alert.alert(
                        place.name,
                        `Type: ${place.type}\n${place.estimatedPrice ? `Price: ${place.estimatedPrice}\n` : ''}${place.openingHours ? `Hours: ${place.openingHours}\n` : ''}${place.context ? `Context: ${place.context}\n` : ''}\n\nChoose a link to open:`,
                        links.map(link => ({
                          text: link.name,
                          onPress: () => {
                            // Open link in browser
                            Linking.openURL(link.url).catch(err => 
                              Alert.alert('Error', 'Could not open link: ' + err.message)
                            );
                          }
                        }))
                      );
                    }}
                  >
                    <View style={styles.placeItemContainer}>
                      <View style={styles.placeTextContainer}>
                        <Text style={styles.linkItemText}>{place.name}</Text>
                        {place.estimatedPrice && (
                          <Text style={styles.linkItemPrice}>{place.estimatedPrice}</Text>
                        )}
                      </View>
                      <TouchableOpacity 
                        style={styles.mapButton}
                        onPress={() => {
                          const searchQuery = encodeURIComponent(place.searchTerms?.[0] || place.name);
                          Linking.openURL(`https://www.google.com/maps/search/${searchQuery}`).catch(err => 
                            Alert.alert('Error', 'Could not open map: ' + err.message)
                          );
                        }}
                      >
                        <Text style={styles.mapButtonText}>🗺️</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            {noteLinks[item._id || item.id].techStack && noteLinks[item._id || item.id].techStack.length > 0 && (
              <View style={styles.linkCategory}>
                <Text style={styles.linkCategoryTitle}>💻 Tech Stack</Text>
                {noteLinks[item._id || item.id].techStack.slice(0, 3).map((tech, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.linkItem}
                    onPress={() => {
                      // Create clickable links to relevant websites
                      const searchQuery = encodeURIComponent(tech.searchTerms?.[0] || tech.name);
                      const links = [
                        { name: 'Google Search', url: `https://www.google.com/search?q=${searchQuery}` },
                        { name: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(tech.name)}` },
                        { name: 'GitHub', url: `https://github.com/search?q=${searchQuery}` },
                        { name: 'Stack Overflow', url: `https://stackoverflow.com/search?q=${searchQuery}` }
                      ];
                      
                      Alert.alert(
                        tech.name,
                        `Type: ${tech.type}\n${tech.context ? `Context: ${tech.context}\n` : ''}\n\nChoose a link to open:`,
                        links.map(link => ({
                          text: link.name,
                          onPress: () => {
                            // Open link in browser
                            Linking.openURL(link.url).catch(err => 
                              Alert.alert('Error', 'Could not open link: ' + err.message)
                            );
                          }
                        }))
                      );
                    }}
                  >
                    <Text style={styles.linkItemText}>{tech.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            
            {noteLinks[item._id || item.id].people && noteLinks[item._id || item.id].people.length > 0 && (
              <View style={styles.linkCategory}>
                <Text style={styles.linkCategoryTitle}>👥 People</Text>
                {noteLinks[item._id || item.id].people.slice(0, 3).map((person, index) => (
                  <TouchableOpacity 
                    key={index} 
                    style={styles.linkItem}
                    onPress={() => {
                      // Create clickable links to relevant websites
                      const searchQuery = encodeURIComponent(person.searchTerms?.[0] || person.name);
                      const links = [
                        { name: 'Google Search', url: `https://www.google.com/search?q=${searchQuery}` },
                        { name: 'LinkedIn', url: `https://www.linkedin.com/search/results/people/?keywords=${searchQuery}` },
                        { name: 'Wikipedia', url: `https://en.wikipedia.org/wiki/${encodeURIComponent(person.name)}` },
                        { name: 'Facebook', url: `https://www.facebook.com/search/people/?q=${searchQuery}` }
                      ];
                      
                      Alert.alert(
                        person.name,
                        `Type: ${person.type}\n${person.context ? `Context: ${person.context}\n` : ''}\n\nChoose a link to open:`,
                        links.map(link => ({
                          text: link.name,
                          onPress: () => {
                            // Open link in browser
                            Linking.openURL(link.url).catch(err => 
                              Alert.alert('Error', 'Could not open link: ' + err.message)
                            );
                          }
                        }))
                      );
                    }}
                  >
                    <Text style={styles.linkItemText}>{person.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.debugText}>No links generated yet for this note</Text>
        )}
      </View>
      
      <TouchableOpacity 
        style={styles.deleteButton}
        onPress={() => deleteNote(item._id || item.id)}
      >
        <Text style={styles.deleteButtonText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  // Navigation Component
  const NavigationBar = () => (
    <View style={styles.navigationBar}>
      <TouchableOpacity
        style={[styles.navButton, currentPage === 'record' && styles.activeNavButton]}
        onPress={() => setCurrentPage('record')}
      >
        <Text style={[styles.navButtonText, currentPage === 'record' && styles.activeNavButtonText]}>
          🎤 Inspelning
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.navButton, currentPage === 'notes' && styles.activeNavButton]}
        onPress={() => setCurrentPage('notes')}
      >
        <Text style={[styles.navButtonText, currentPage === 'notes' && styles.activeNavButtonText]}>
          📝 Anteckningar
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.navButton, currentPage === 'insights' && styles.activeNavButton]}
        onPress={() => setCurrentPage('insights')}
      >
        <Text style={[styles.navButtonText, currentPage === 'insights' && styles.activeNavButtonText]}>
          🔍 Insikter
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.navButton, currentPage === 'chat' && styles.activeNavButton]}
        onPress={() => setCurrentPage('chat')}
      >
        <Text style={[styles.navButtonText, currentPage === 'chat' && styles.activeNavButtonText]}>
          🤖 AI Chat {ragContext && ragContext.length > 0 && '🧠'}
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.navButton, currentPage === 'calendar' && styles.activeNavButton]}
        onPress={() => setCurrentPage('calendar')}
      >
        <Text style={[styles.navButtonText, currentPage === 'calendar' && styles.activeNavButtonText]}>
          📅 Kalender
        </Text>
      </TouchableOpacity>
    </View>
  );

  // Notes Page Component - Shows notes and company info
  const NotesPage = () => {
    const loadDynamicInfo = async () => {
      if (notes.length === 0) {
        Alert.alert('Inga anteckningar', 'Du behöver ha anteckningar för att extrahera information.');
        return;
      }

      setIsLoadingDynamicInfo(true);
      try {
        const dynamicData = await extractDynamicInfo();
        setDynamicInfo(dynamicData);
      } catch (error) {
        Alert.alert('Fel', 'Kunde inte extrahera information. Försök igen.');
      } finally {
        setIsLoadingDynamicInfo(false);
      }
    };

    return (
      <ScrollView style={styles.notesPageContainer} showsVerticalScrollIndicator={true}>
        <View style={styles.notesSection}>
          <Text style={styles.notesSectionTitle}>📋 Dina Anteckningar ({notes.length})</Text>
          
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
              style={[styles.companyInfoButton, isLoadingDynamicInfo && styles.loadingButton]}
              onPress={loadDynamicInfo}
              disabled={isLoadingDynamicInfo}
            >
              <Text style={styles.companyInfoButtonText}>
                {isLoadingDynamicInfo ? '🔄 Hämtar...' : '🔍 Smart Info'}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.companyInfoButton, { backgroundColor: '#4caf50' }]}
              onPress={async () => {
                console.log('Manual link generation triggered - forcing regeneration');
                // Clear existing empty links
                setNoteLinks({});
                // Small delay to ensure state is cleared
                setTimeout(async () => {
                  await generateLinksForAllNotes(true);
                }, 100);
              }}
            >
              <Text style={styles.companyInfoButtonText}>
                🔗 Testa Länkar
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.companyInfoButton, { backgroundColor: '#ff9800' }]}
              onPress={() => {
                console.log('Current noteLinks state:', noteLinks);
                console.log('Number of notes with links:', Object.keys(noteLinks).length);
                Alert.alert('Debug Info', `Links for ${Object.keys(noteLinks).length} notes. Check console for details.`);
              }}
            >
              <Text style={styles.companyInfoButtonText}>
                🐛 Debug
              </Text>
            </TouchableOpacity>
            
          </View>
          <View style={styles.notesListContainer}>
            {notes.map((note, index) => (
              <View key={note._id || note.id || index}>
                {renderNote({ item: note, index })}
              </View>
            ))}
          </View>
        </View>

        {/* Dynamic Information Section */}
        {dynamicInfo && (
          <View style={styles.companyInfoSection}>
            <View style={styles.infoHeader}>
              <Text style={styles.companyInfoTitle}>🔍 Smart Information</Text>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => setDynamicInfo(null)}
              >
                <Text style={styles.backButtonText}>✕ Stäng</Text>
              </TouchableOpacity>
            </View>
            
            {/* Companies */}
            {dynamicInfo.companies && dynamicInfo.companies.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🏢 Företag & Platser</Text>
                {dynamicInfo.companies.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    <Text style={styles.companyType}>Typ: {item.type}</Text>
                    {item.description && (
                      <Text style={styles.companyDescription}>{item.description}</Text>
                    )}
                    {item.address && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📍 Adress:</Text>
                        <Text style={styles.companyDetailValue}>{item.address}</Text>
                      </View>
                    )}
                    {item.phone && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📞 Telefon:</Text>
                        <Text style={styles.companyDetailValue}>{item.phone}</Text>
                      </View>
                    )}
                    {item.website && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Hemsida:</Text>
                        <Text style={styles.companyDetailValue}>{item.website}</Text>
                      </View>
                    )}
                    {item.openingHours && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🕒 Öppettider:</Text>
                        <Text style={styles.companyDetailValue}>{item.openingHours}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* People */}
            {dynamicInfo.people && dynamicInfo.people.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>👥 Personer & Kontakter</Text>
                {dynamicInfo.people.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.title && <Text style={styles.companyType}>Titel: {item.title}</Text>}
                    {item.company && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🏢 Företag:</Text>
                        <Text style={styles.companyDetailValue}>{item.company}</Text>
                      </View>
                    )}
                    {item.contact && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📞 Kontakt:</Text>
                        <Text style={styles.companyDetailValue}>{item.contact}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Events */}
            {dynamicInfo.events && dynamicInfo.events.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>📅 Event & Aktiviteter</Text>
                {dynamicInfo.events.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.date && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📅 Datum:</Text>
                        <Text style={styles.companyDetailValue}>{item.date}</Text>
                      </View>
                    )}
                    {item.location && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📍 Plats:</Text>
                        <Text style={styles.companyDetailValue}>{item.location}</Text>
                      </View>
                    )}
                    {item.tickets && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🎫 Biljetter:</Text>
                        <Text style={styles.companyDetailValue}>{item.tickets}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Products */}
            {dynamicInfo.products && dynamicInfo.products.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🛍️ Produkter & Tjänster</Text>
                {dynamicInfo.products.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.type && <Text style={styles.companyType}>Typ: {item.type}</Text>}
                    {item.price && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Pris:</Text>
                        <Text style={styles.companyDetailValue}>{item.price}</Text>
                      </View>
                    )}
                    {item.specifications && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📋 Specifikationer:</Text>
                        <Text style={styles.companyDetailValue}>{item.specifications}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Technology */}
            {dynamicInfo.technology && dynamicInfo.technology.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>💻 Teknologi & Verktyg</Text>
                {dynamicInfo.technology.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.type && <Text style={styles.companyType}>Typ: {item.type}</Text>}
                    {item.features && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>⚡ Funktioner:</Text>
                        <Text style={styles.companyDetailValue}>{item.features}</Text>
                      </View>
                    )}
                    {item.pricing && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Pris:</Text>
                        <Text style={styles.companyDetailValue}>{item.pricing}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Education */}
            {dynamicInfo.education && dynamicInfo.education.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🎓 Utbildning & Kurser</Text>
                {dynamicInfo.education.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.provider && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🏫 Leverantör:</Text>
                        <Text style={styles.companyDetailValue}>{item.provider}</Text>
                      </View>
                    )}
                    {item.duration && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>⏱️ Längd:</Text>
                        <Text style={styles.companyDetailValue}>{item.duration}</Text>
                      </View>
                    )}
                    {item.cost && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Kostnad:</Text>
                        <Text style={styles.companyDetailValue}>{item.cost}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Health */}
            {dynamicInfo.health && dynamicInfo.health.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🏥 Hälsa & Vård</Text>
                {dynamicInfo.health.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.specialty && <Text style={styles.companyType}>Specialitet: {item.specialty}</Text>}
                    {item.clinic && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🏥 Klinik:</Text>
                        <Text style={styles.companyDetailValue}>{item.clinic}</Text>
                      </View>
                    )}
                    {item.phone && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>📞 Telefon:</Text>
                        <Text style={styles.companyDetailValue}>{item.phone}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Culture */}
            {dynamicInfo.culture && dynamicInfo.culture.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🎭 Kultur & Underhållning</Text>
                {dynamicInfo.culture.map((item, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{item.name}</Text>
                    {item.type && <Text style={styles.companyType}>Typ: {item.type}</Text>}
                    {item.genre && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🎨 Genre:</Text>
                        <Text style={styles.companyDetailValue}>{item.genre}</Text>
                      </View>
                    )}
                    {item.rating && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>⭐ Betyg:</Text>
                        <Text style={styles.companyDetailValue}>{item.rating}</Text>
                      </View>
                    )}
                    {item.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
            
            {/* Back to Notes Button */}
            <View style={styles.bottomButtonsContainer}>
              <TouchableOpacity 
                style={styles.backToNotesButton}
                onPress={() => setDynamicInfo(null)}
              >
                <Text style={styles.backToNotesButtonText}>📋 Tillbaka till Anteckningar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.scrollToTopButton}
                onPress={() => {
                  // Scroll to top functionality
                  setDynamicInfo(null);
                }}
              >
                <Text style={styles.scrollToTopButtonText}>⬆️ Tillbaka till toppen</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Product Links Section */}
        {productLinks && (
          <View style={styles.companyInfoSection}>
            <View style={styles.infoHeader}>
              <Text style={styles.companyInfoTitle}>🔗 Produktlänkar & Priser</Text>
              <TouchableOpacity 
                style={styles.backButton}
                onPress={() => setProductLinks(null)}
              >
                <Text style={styles.backButtonText}>✕ Stäng</Text>
              </TouchableOpacity>
            </View>
            
            {/* Products */}
            {productLinks.products && productLinks.products.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🛍️ Produkter</Text>
                {productLinks.products.map((product, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{product.name}</Text>
                    <Text style={styles.companyType}>Typ: {product.type}</Text>
                    {product.estimatedPrice && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Uppskattat pris:</Text>
                        <Text style={styles.companyDetailValue}>{product.estimatedPrice}</Text>
                      </View>
                    )}
                    {product.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{product.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {product.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{product.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {product.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', product.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Services */}
            {productLinks.services && productLinks.services.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🎓 Tjänster & Kurser</Text>
                {productLinks.services.map((service, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{service.name}</Text>
                    <Text style={styles.companyType}>Typ: {service.type}</Text>
                    {service.estimatedPrice && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Uppskattat pris:</Text>
                        <Text style={styles.companyDetailValue}>{service.estimatedPrice}</Text>
                      </View>
                    )}
                    {service.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{service.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {service.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{service.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {service.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', service.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Events */}
            {productLinks.events && productLinks.events.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>📅 Evenemang</Text>
                {productLinks.events.map((event, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{event.name}</Text>
                    <Text style={styles.companyType}>Typ: {event.type}</Text>
                    {event.estimatedPrice && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Uppskattat pris:</Text>
                        <Text style={styles.companyDetailValue}>{event.estimatedPrice}</Text>
                      </View>
                    )}
                    {event.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{event.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {event.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{event.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {event.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', event.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Places */}
            {productLinks.places && productLinks.places.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>📍 Platser & Attraktioner</Text>
                {productLinks.places.map((place, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{place.name}</Text>
                    <Text style={styles.companyType}>Typ: {place.type}</Text>
                    {place.estimatedPrice && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Avgift/Pris:</Text>
                        <Text style={styles.companyDetailValue}>{place.estimatedPrice}</Text>
                      </View>
                    )}
                    {place.openingHours && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🕒 Öppettider:</Text>
                        <Text style={styles.companyDetailValue}>{place.openingHours}</Text>
                      </View>
                    )}
                    {place.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{place.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {place.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{place.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {place.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', place.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* People */}
            {productLinks.people && productLinks.people.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>👥 Personer</Text>
                {productLinks.people.map((person, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{person.name}</Text>
                    <Text style={styles.companyType}>Typ: {person.type}</Text>
                    {person.context && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>ℹ️ Kontext:</Text>
                        <Text style={styles.companyDetailValue}>{person.context}</Text>
                      </View>
                    )}
                    {person.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{person.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {person.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{person.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {person.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', person.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Concepts */}
            {productLinks.concepts && productLinks.concepts.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>💡 Koncept & Tekniker</Text>
                {productLinks.concepts.map((concept, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{concept.name}</Text>
                    <Text style={styles.companyType}>Typ: {concept.type}</Text>
                    {concept.context && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>ℹ️ Kontext:</Text>
                        <Text style={styles.companyDetailValue}>{concept.context}</Text>
                      </View>
                    )}
                    {concept.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{concept.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {concept.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{concept.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {concept.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', concept.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Activities */}
            {productLinks.activities && productLinks.activities.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>🏃 Aktiviteter & Hobby</Text>
                {productLinks.activities.map((activity, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{activity.name}</Text>
                    <Text style={styles.companyType}>Typ: {activity.type}</Text>
                    {activity.context && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>ℹ️ Kontext:</Text>
                        <Text style={styles.companyDetailValue}>{activity.context}</Text>
                      </View>
                    )}
                    {activity.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{activity.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {activity.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{activity.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {activity.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', activity.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Resources */}
            {productLinks.resources && productLinks.resources.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>📚 Resurser & Material</Text>
                {productLinks.resources.map((resource, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{resource.name}</Text>
                    <Text style={styles.companyType}>Typ: {resource.type}</Text>
                    {resource.estimatedPrice && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>💰 Pris:</Text>
                        <Text style={styles.companyDetailValue}>{resource.estimatedPrice}</Text>
                      </View>
                    )}
                    {resource.context && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>ℹ️ Kontext:</Text>
                        <Text style={styles.companyDetailValue}>{resource.context}</Text>
                      </View>
                    )}
                    {resource.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{resource.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {resource.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{resource.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {resource.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', resource.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Tech Stack */}
            {productLinks.techStack && productLinks.techStack.length > 0 && (
              <View style={styles.infoCategory}>
                <Text style={styles.categoryTitle}>💻 Tech Stack & Tekniker</Text>
                {productLinks.techStack.map((tech, index) => (
                  <View key={index} style={styles.companyCard}>
                    <Text style={styles.companyName}>{tech.name}</Text>
                    <Text style={styles.companyType}>Typ: {tech.type}</Text>
                    {tech.context && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>ℹ️ Kontext:</Text>
                        <Text style={styles.companyDetailValue}>{tech.context}</Text>
                      </View>
                    )}
                    {tech.searchTerms && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🔍 Söktermer:</Text>
                        <Text style={styles.companyDetailValue}>{tech.searchTerms.join(', ')}</Text>
                      </View>
                    )}
                    {tech.suggestedSites && (
                      <View style={styles.companyDetail}>
                        <Text style={styles.companyDetailLabel}>🌐 Föreslagna webbplatser:</Text>
                        <Text style={styles.companyDetailValue}>{tech.suggestedSites.join(', ')}</Text>
                      </View>
                    )}
                    {tech.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', tech.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
            
            {/* Back to Notes Button */}
            <View style={styles.bottomButtonsContainer}>
              <TouchableOpacity 
                style={styles.backToNotesButton}
                onPress={() => setProductLinks(null)}
              >
                <Text style={styles.backToNotesButtonText}>📋 Tillbaka till Anteckningar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    );
  };

  // Recording Page Component - For recording and transcription
  const RecordingPage = () => (
    <View style={styles.recordingContainer}>
      <Text style={styles.recordingTitle}>🎤 Skapa Ny Anteckning</Text>
      
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Skriv din anteckning eller använd röstinspelning..."
          value={currentNote}
          onChangeText={setCurrentNote}
          multiline
        />
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.recordButton, isRecording && styles.recordingButton, isTranscribing && styles.transcribingButton]}
            onPress={isRecording ? stopRecording : startRecording}
            disabled={isTranscribing}
          >
            <Text style={styles.recordButtonText}>
              {isTranscribing ? '🔄 Transkriberar...' : isRecording ? '🛑 Stoppa' : '🎤 Spela in'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveNote}
          >
            <Text style={styles.saveButtonText}>💾 Spara</Text>
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => {
            const testNote = "Möte med John imorgon kl 15:00 om projektets deadline";
            setCurrentNote(testNote);
          }}
        >
          <Text style={styles.testButtonText}>🧪 Test med Exempel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Insights Page Component
  const InsightsPage = () => {
    const generateInsights = async () => {
      if (notes.length === 0) {
        Alert.alert('Inga anteckningar', 'Du behöver ha anteckningar för att generera insikter.');
        return;
      }

      setIsAnalyzing(true);
      try {
        const analysisResult = await analyzeNotesForInsights();
        setInsights(analysisResult);
      } catch (error) {
        Alert.alert('Fel', 'Kunde inte analysera anteckningarna. Försök igen.');
      } finally {
        setIsAnalyzing(false);
      }
    };

    const renderTechStack = (techstack) => (
      <View style={styles.insightSection}>
        <Text style={styles.insightSectionTitle}>🛠️ Tech Stack</Text>
        {techstack.map((item, index) => (
          <View key={index} style={styles.techItem}>
            <Text style={styles.techName}>{item.name}</Text>
            <Text style={styles.techDescription}>{item.description}</Text>
            {item.sourceNote && (
              <TouchableOpacity 
                style={styles.sourceButton}
                onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
              >
                <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );

    const renderProjects = (projects) => (
      <View style={styles.insightSection}>
        <Text style={styles.insightSectionTitle}>📁 Projekt</Text>
        {projects.map((project, index) => (
          <View key={index} style={styles.projectItem}>
            <Text style={styles.projectName}>{project.name}</Text>
            <Text style={styles.projectDescription}>{project.description}</Text>
            <Text style={styles.projectStatus}>Status: {project.status}</Text>
            {project.sourceNote && (
              <TouchableOpacity 
                style={styles.sourceButton}
                onPress={() => Alert.alert('Källanteckning', project.sourceNote)}
              >
                <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );

    const renderTasks = (tasks) => (
      <View style={styles.insightSection}>
        <Text style={styles.insightSectionTitle}>✅ Uppgifter</Text>
        {tasks.map((task, index) => (
          <View key={index} style={styles.taskItem}>
            <Text style={styles.taskText}>{task.task}</Text>
            <Text style={styles.taskPriority}>Prioritet: {task.priority}</Text>
            {task.deadline && <Text style={styles.taskDeadline}>Deadline: {task.deadline}</Text>}
            {task.sourceNote && (
              <TouchableOpacity 
                style={styles.sourceButton}
                onPress={() => Alert.alert('Källanteckning', task.sourceNote)}
              >
                <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );

    const renderLearning = (learning) => (
      <View style={styles.insightSection}>
        <Text style={styles.insightSectionTitle}>📚 Lärande</Text>
        {learning.map((item, index) => (
          <View key={index} style={styles.learningItem}>
            <Text style={styles.learningTopic}>{item.topic}</Text>
            <Text style={styles.learningProgress}>Nivå: {item.progress}</Text>
            {item.resources && (
              <Text style={styles.learningResources}>Resurser: {item.resources.join(', ')}</Text>
            )}
            {item.sourceNote && (
              <TouchableOpacity 
                style={styles.sourceButton}
                onPress={() => Alert.alert('Källanteckning', item.sourceNote)}
              >
                <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
    );

    return (
      <View style={styles.insightsContainer}>
        <Text style={styles.insightsTitle}>🔍 AI Insikter från dina Anteckningar</Text>
        
        <TouchableOpacity
          style={[styles.analyzeButton, isAnalyzing && styles.analyzingButton]}
          onPress={generateInsights}
          disabled={isAnalyzing}
        >
          <Text style={styles.analyzeButtonText}>
            {isAnalyzing ? '🔄 Analyserar...' : '🔍 Analysera Anteckningar'}
          </Text>
        </TouchableOpacity>

        {insights && insights.categories && (
          <ScrollView style={styles.insightsContent}>
            {insights.categories.technology && (
              <>
                {insights.categories.technology.techstack && renderTechStack(insights.categories.technology.techstack)}
                {insights.categories.technology.tools && (
                  <View style={styles.insightSection}>
                    <Text style={styles.insightSectionTitle}>🔧 Verktyg</Text>
                    {insights.categories.technology.tools.map((tool, index) => (
                      <View key={index} style={styles.techItem}>
                        <Text style={styles.techName}>{tool.name}</Text>
                        <Text style={styles.techDescription}>{tool.description}</Text>
                        {tool.sourceNote && (
                          <TouchableOpacity 
                            style={styles.sourceButton}
                            onPress={() => Alert.alert('Källanteckning', tool.sourceNote)}
                          >
                            <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
                {insights.categories.technology.languages && (
                  <View style={styles.insightSection}>
                    <Text style={styles.insightSectionTitle}>💻 Programmeringsspråk</Text>
                    {insights.categories.technology.languages.map((lang, index) => (
                      <View key={index} style={styles.techItem}>
                        <Text style={styles.techName}>{lang.name}</Text>
                        <Text style={styles.techDescription}>{lang.description}</Text>
                        {lang.sourceNote && (
                          <TouchableOpacity 
                            style={styles.sourceButton}
                            onPress={() => Alert.alert('Källanteckning', lang.sourceNote)}
                          >
                            <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
            
            {insights.categories.projects && renderProjects(insights.categories.projects)}
            {insights.categories.tasks && renderTasks(insights.categories.tasks)}
            {insights.categories.learning && renderLearning(insights.categories.learning)}
            
            {insights.categories.ideas && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>💡 Idéer</Text>
                {insights.categories.ideas.map((idea, index) => (
                  <View key={index} style={styles.ideaItem}>
                    <Text style={styles.ideaText}>{idea.idea}</Text>
                    <Text style={styles.ideaCategory}>Kategori: {idea.category}</Text>
                    <Text style={styles.ideaFeasibility}>Genomförbarhet: {idea.feasibility}</Text>
                    {idea.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', idea.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.companies && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>🏢 Företag & Platser</Text>
                {insights.categories.companies.map((company, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{company.name}</Text>
                    <Text style={styles.companyType}>{company.type}</Text>
                    {company.description && (
                      <Text style={styles.companyDescription}>{company.description}</Text>
                    )}
                    {company.address && (
                      <Text style={styles.companyAddress}>📍 {company.address}</Text>
                    )}
                    {company.phone && (
                      <Text style={styles.companyPhone}>📞 {company.phone}</Text>
                    )}
                    {company.website && (
                      <Text style={styles.companyWebsite}>🌐 {company.website}</Text>
                    )}
                    {company.openingHours && (
                      <Text style={styles.companyHours}>🕒 {company.openingHours}</Text>
                    )}
                    {company.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', company.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.people && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>👥 Personer & Kontakter</Text>
                {insights.categories.people.map((person, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{person.name}</Text>
                    {person.title && <Text style={styles.companyType}>Titel: {person.title}</Text>}
                    {person.company && (
                      <Text style={styles.companyAddress}>🏢 {person.company}</Text>
                    )}
                    {person.contact && (
                      <Text style={styles.companyPhone}>📞 {person.contact}</Text>
                    )}
                    {person.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', person.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.events && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>📅 Event & Aktiviteter</Text>
                {insights.categories.events.map((event, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{event.name}</Text>
                    {event.date && (
                      <Text style={styles.companyAddress}>📅 {event.date}</Text>
                    )}
                    {event.location && (
                      <Text style={styles.companyPhone}>📍 {event.location}</Text>
                    )}
                    {event.tickets && (
                      <Text style={styles.companyWebsite}>🎫 {event.tickets}</Text>
                    )}
                    {event.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', event.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.products && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>🛍️ Produkter & Tjänster</Text>
                {insights.categories.products.map((product, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{product.name}</Text>
                    {product.type && <Text style={styles.companyType}>Typ: {product.type}</Text>}
                    {product.price && (
                      <Text style={styles.companyAddress}>💰 {product.price}</Text>
                    )}
                    {product.specifications && (
                      <Text style={styles.companyPhone}>📋 {product.specifications}</Text>
                    )}
                    {product.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', product.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.places && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>🗺️ Platser & Resor</Text>
                {insights.categories.places.map((place, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{place.name}</Text>
                    {place.type && <Text style={styles.companyType}>Typ: {place.type}</Text>}
                    {place.address && (
                      <Text style={styles.companyAddress}>📍 {place.address}</Text>
                    )}
                    {place.openingHours && (
                      <Text style={styles.companyPhone}>🕒 {place.openingHours}</Text>
                    )}
                    {place.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', place.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.education && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>🎓 Utbildning & Kurser</Text>
                {insights.categories.education.map((course, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{course.name}</Text>
                    {course.provider && (
                      <Text style={styles.companyAddress}>🏫 {course.provider}</Text>
                    )}
                    {course.duration && (
                      <Text style={styles.companyPhone}>⏱️ {course.duration}</Text>
                    )}
                    {course.cost && (
                      <Text style={styles.companyWebsite}>💰 {course.cost}</Text>
                    )}
                    {course.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', course.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.health && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>🏥 Hälsa & Vård</Text>
                {insights.categories.health.map((health, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{health.name}</Text>
                    {health.specialty && <Text style={styles.companyType}>Specialitet: {health.specialty}</Text>}
                    {health.clinic && (
                      <Text style={styles.companyAddress}>🏥 {health.clinic}</Text>
                    )}
                    {health.phone && (
                      <Text style={styles.companyPhone}>📞 {health.phone}</Text>
                    )}
                    {health.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', health.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {insights.categories.culture && (
              <View style={styles.insightSection}>
                <Text style={styles.insightSectionTitle}>🎭 Kultur & Underhållning</Text>
                {insights.categories.culture.map((culture, index) => (
                  <View key={index} style={styles.companyItem}>
                    <Text style={styles.companyName}>{culture.name}</Text>
                    {culture.type && <Text style={styles.companyType}>Typ: {culture.type}</Text>}
                    {culture.genre && (
                      <Text style={styles.companyAddress}>🎨 {culture.genre}</Text>
                    )}
                    {culture.rating && (
                      <Text style={styles.companyPhone}>⭐ {culture.rating}</Text>
                    )}
                    {culture.sourceNote && (
                      <TouchableOpacity 
                        style={styles.sourceButton}
                        onPress={() => Alert.alert('Källanteckning', culture.sourceNote)}
                      >
                        <Text style={styles.sourceButtonText}>📄 Visa källanteckning</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </View>
    );
  };

  // Chat Page Component with RAG Context
  const ChatPage = () => (
    <View style={styles.chatContainer}>
      <ScrollView style={styles.chatMessages}>
        {chatMessages.map((message) => (
          <View key={message.id} style={[
            styles.messageContainer,
            message.isUser ? styles.userMessage : styles.aiMessage
          ]}>
            <Text style={[
              styles.messageText,
              message.isUser ? styles.userMessageText : styles.aiMessageText
            ]}>
              {message.text}
            </Text>
            <Text style={styles.messageTime}>
              {message.timestamp.toLocaleTimeString()}
            </Text>
          </View>
        ))}
        
        {/* RAG Context Display */}
        {ragContext && ragContext.length > 0 && (
          <View style={styles.ragContextContainer}>
            <Text style={styles.ragContextTitle}>🔍 Använda anteckningar för svar:</Text>
            {ragContext.map((note, index) => (
              <View key={index} style={styles.ragContextItem}>
                <Text style={styles.ragContextText}>
                  {note.content || note.text}
                </Text>
                {note.matchedKeywords && note.matchedKeywords.length > 0 && (
                  <Text style={styles.ragContextKeywords}>
                    Matchade ord: {note.matchedKeywords.join(', ')}
                  </Text>
                )}
                <Text style={styles.ragContextScore}>
                  Relevans: {note.relevanceScore}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      
      <View style={styles.chatInputContainer}>
        <TextInput
          style={styles.chatInput}
          placeholder="Ställ en fråga om dina anteckningar... (RAG aktiverat)"
          value={chatInput}
          onChangeText={setChatInput}
          multiline
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={sendChatMessage}
        >
          <Text style={styles.sendButtonText}>Skicka</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Calendar Page Component
  const CalendarPage = () => {
    const upcomingReminders = notes.flatMap(note => 
      note.reminders ? note.reminders.map(reminder => ({
        ...reminder,
        noteTitle: note.content || note.text,
        noteId: note._id || note.id
      })) : []
    ).filter(reminder => new Date(reminder.date) > new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date));

    return (
      <View style={styles.calendarContainer}>
        <Text style={styles.calendarTitle}>📅 Kommande Påminnelser</Text>
        <FlatList
          data={upcomingReminders}
          renderItem={({ item }) => (
            <View style={styles.reminderCard}>
              <Text style={styles.reminderDate}>
                {new Date(item.date).toLocaleDateString('sv-SE')} {new Date(item.date).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.reminderText}>{item.text}</Text>
              <Text style={styles.reminderNote}>{item.noteTitle}</Text>
              <TouchableOpacity 
                style={styles.addToCalendarButton}
                onPress={() => {
                  const note = notes.find(n => (n._id || n.id) === item.noteId);
                  if (note) addToCalendar(note);
                }}
              >
                <Text style={styles.addToCalendarButtonText}>📅 Lägg till i kalender</Text>
              </TouchableOpacity>
            </View>
          )}
          keyExtractor={(item, index) => index.toString()}
          style={styles.remindersList}
          showsVerticalScrollIndicator={true}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🎤 Noteable</Text>
      </View>
      
      <NavigationBar />
      
      <View style={styles.pageContainer}>
        {currentPage === 'record' && <RecordingPage />}
        {currentPage === 'notes' && <NotesPage />}
        {currentPage === 'insights' && <InsightsPage />}
        {currentPage === 'chat' && <ChatPage />}
        {currentPage === 'calendar' && <CalendarPage />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 40,
    paddingHorizontal: 15,
  },
  header: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  navigationBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 5,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  activeNavButton: {
    backgroundColor: '#2196F3',
  },
  navButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  activeNavButtonText: {
    color: '#fff',
  },
  pageContainer: {
    flex: 1,
  },
  recordingContainer: {
    flex: 1,
  },
  recordingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  chatToggleButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 15,
  },
  chatToggleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  chatContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  chatMessages: {
    flex: 1,
    padding: 15,
  },
  messageContainer: {
    marginBottom: 15,
    maxWidth: '80%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 15,
    borderBottomRightRadius: 5,
  },
  aiMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 15,
    borderBottomLeftRadius: 5,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },
  aiMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
    textAlign: 'right',
  },
  chatInputContainer: {
    flexDirection: 'row',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  chatInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    maxHeight: 100,
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recordButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flex: 0.45,
  },
  recordingButton: {
    backgroundColor: '#f44336',
  },
  transcribingButton: {
    backgroundColor: '#ff9800',
  },
  recordButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    flex: 0.45,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  testButton: {
    backgroundColor: '#ff9800',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 8,
    alignSelf: 'center',
  },
  testButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 12,
  },
  notesSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    margin: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  notesSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  notesList: {
    flex: 1,
  },
  notesListContent: {
    paddingBottom: 20,
  },
  noteCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  noteText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
    color: '#333',
  },
  noteTime: {
    fontSize: 12,
    color: '#999',
    marginBottom: 10,
  },
  infoSection: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  tagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  infoTag: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#2196f3',
  },
  topicTag: {
    backgroundColor: '#f3e5f5',
    borderColor: '#9c27b0',
  },
  actionTag: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4caf50',
  },
  reminderTag: {
    backgroundColor: '#fff3e0',
    borderColor: '#ff9800',
  },
  tagText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  calendarButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  calendarButtonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#ffebee',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  deleteButtonText: {
    color: '#d32f2f',
    fontWeight: 'bold',
    fontSize: 12,
  },
  calendarContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  calendarTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  remindersList: {
    flex: 1,
  },
  reminderCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  reminderDate: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 5,
  },
  reminderText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 5,
  },
  reminderNote: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  addToCalendarButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  addToCalendarButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  insightsContainer: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  insightsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  analyzeButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    marginBottom: 20,
    alignSelf: 'center',
  },
  analyzingButton: {
    backgroundColor: '#ff9800',
  },
  analyzeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  insightsContent: {
    flex: 1,
  },
  insightSection: {
    marginBottom: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  insightSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  techItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  techName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  techDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  projectItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  projectName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4caf50',
    marginBottom: 4,
  },
  projectDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  projectStatus: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '600',
  },
  taskItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  taskText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
  },
  taskPriority: {
    fontSize: 12,
    color: '#f44336',
    fontWeight: '600',
  },
  taskDeadline: {
    fontSize: 12,
    color: '#ff9800',
    fontWeight: '600',
  },
  learningItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  learningTopic: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9c27b0',
    marginBottom: 4,
  },
  learningProgress: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
    marginBottom: 4,
  },
  learningResources: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  ideaItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ideaText: {
    fontSize: 15,
    color: '#333',
    marginBottom: 4,
  },
  ideaCategory: {
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
    marginBottom: 2,
  },
  ideaFeasibility: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
  },
  sourceButton: {
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 15,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  sourceButtonText: {
    color: '#2196F3',
    fontSize: 11,
    fontWeight: '600',
  },
  notesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    flexWrap: 'wrap',
  },
  companyInfoButton: {
    backgroundColor: '#4caf50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 15,
    minWidth: 120,
  },
  loadingButton: {
    backgroundColor: '#ff9800',
  },
  companyInfoButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  infoCategory: {
    marginBottom: 20,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    paddingBottom: 5,
    borderBottomWidth: 2,
    borderBottomColor: '#e0e0e0',
  },
  ragContextContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    margin: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  ragContextTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 10,
  },
  ragContextItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ragContextText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 5,
  },
  ragContextKeywords: {
    fontSize: 10,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 3,
  },
  ragContextScore: {
    fontSize: 10,
    color: '#4caf50',
    fontWeight: 'bold',
  },
  companyInfoSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginTop: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  companyInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
  },
  backButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  backToNotesButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginTop: 20,
    alignSelf: 'center',
  },
  backToNotesButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bottomButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingHorizontal: 10,
  },
  scrollToTopButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  scrollToTopButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  notesPageContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  notesListContainer: {
    flex: 1,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 15,
    flexWrap: 'wrap',
  },
  companyCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  companyType: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  companyDescription: {
    fontSize: 14,
    color: '#333',
    marginBottom: 10,
  },
  companyDetail: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  companyDetailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    width: 80,
  },
  companyDetailValue: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  companyItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  companyAddress: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  companyPhone: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  companyWebsite: {
    fontSize: 13,
    color: '#2196F3',
    marginBottom: 4,
  },
  companyHours: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  // Auto-generated links styles
  linksContainer: {
    marginTop: 8,
  },
  linkCategory: {
    marginBottom: 12,
  },
  linkCategoryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  linkItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    padding: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#2196F3',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  linkItemText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flex: 1,
  },
  placeItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  placeTextContainer: {
    flex: 1,
  },
  mapButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  mapButtonText: {
    fontSize: 16,
    color: 'white',
  },
  linkItemPrice: {
    fontSize: 12,
    color: '#4caf50',
    fontWeight: '600',
    marginLeft: 8,
  },
  debugText: {
    fontSize: 10,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 4,
  },
});
