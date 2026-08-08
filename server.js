const express = require('express');
const cors = require('cors');
const ytSearch = require('yt-search');
const path = require('path');
const axios = require('axios');
const { spawn } = require('child_process');
const fs = require('fs');

const app = express();
app.use(cors());

// Spotify Benzeri Akıllı Ayrıştırıcı ve Öneri Havuzu
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: 'Sorgu gerekli' });
        
        const primarySearch = await ytSearch(query);
        let results = primarySearch.videos.slice(0, 5).map(v => ({
            title: v.title,
            artist: v.author.name,
            url: v.url,
            thumbnail: v.thumbnail,
            duration: v.timestamp
        }));

        if (primarySearch.videos.length > 0) {
            const firstVideo = primarySearch.videos[0];
            const rawArtist = firstVideo.author.name || "";
            const cleanArtist = rawArtist.replace(/- Topic|VEVO|Official|Netd Music|Müzik/gi, '').trim();

            let secondaryQuery = cleanArtist.length > 2 ? `${cleanArtist} sevilen şarkıları mix` : `${query} benzer şarkılar`;
            const secondarySearch = await ytSearch(secondaryQuery);
            
            const secondaryResults = secondarySearch.videos.slice(0, 10).map(v => ({
                title: v.title,
                artist: v.author.name,
                url: v.url,
                thumbnail: v.thumbnail,
                duration: v.timestamp
            }));

            const combined = [...results, ...secondaryResults];
            const uniqueVideos = Array.from(new Map(combined.map(item => [item.url, item])).values());
            
            return res.json(uniqueVideos);
        }

        res.json(results);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Arama başarısız' });
    }
});

// Şarkı Sözü Servisi
app.get('/api/lyrics', async (req, res) => {
    try {
        const { artist, title } = req.query;
        const response = await axios.get(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, { timeout: 4000 });
        if (response.data && response.data.lyrics) {
            res.json({ lyrics: response.data.lyrics });
        } else {
            res.json({ lyrics: "Bu parça için şarkı sözü bulunamadı." });
        }
    } catch (e) {
        res.json({ lyrics: "Şarkı sözleri veritabanından alınamadı." });
    }
});

// Ses Akış Servisi (yt-dlp ve cookie destekli)
app.get('/api/stream', async (req, res) => {
    const url = req.query.url;
    if (!url) return res.status(400).send('URL eksik');

    try {
        res.setHeader('Content-Type', 'audio/mpeg');

        const ytDlpArgs = [
            '-f', 'bestaudio',
            '-o', '-',
            url
        ];

        // Eğer .data/youtube.data dosyası varsa yt-dlp'ye cookie'yi tanıtıyoruz
        if (fs.existsSync('./.data/youtube.data')) {
            ytDlpArgs.unshift('--cookies', './.data/youtube.data');
        }

        const ytDlp = spawn('./yt-dlp', ytDlpArgs);

        ytDlp.stdout.pipe(res);

        ytDlp.stderr.on('data', (data) => {
            console.error(`yt-dlp hata: ${data}`);
        });

        req.on('close', () => {
            ytDlp.kill();
        });

    } catch (err) {
        console.error('Yürütme hatası:', err);
        if (!res.headersSent) res.status(500).end();
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Sunucu http://localhost:${PORT} adresinde aktif.`));