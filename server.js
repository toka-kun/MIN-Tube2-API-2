const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

let apis = null;
const MAX_API_WAIT_TIME = 3000;
const MAX_TIME = 10000;

// API一覧を取得する関数
async function getapis() {
  try {
    const response = await axios.get('https://raw.githubusercontent.com/Minotaur-ZAOU/test/refs/heads/main/min.json');
    apis = response.data;
    console.log('APIs loaded:', apis);
  } catch (error) {
    console.error('Failed to load APIs:', error);
  }
}

// 動画情報を取得する関数
async function ggvideo(videoId) {
  const startTime = Date.now();
  if (!apis) {
    await getapis();
  }
  for (const instance of apis) {
    try {
      const response = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: MAX_API_WAIT_TIME });
      console.log(`Tried URL: ${instance}/api/v1/videos/${videoId}`);
      if (response.data && response.data.formatStreams) {
        return response.data;
      } else {
        console.error(`formatStreams missing at: ${instance}`);
      }
    } catch (error) {
      console.error(`Error at ${instance}: ${error.message}`);
    }
    if (Date.now() - startTime >= MAX_TIME) {
      throw new Error("Connection timed out");
    }
  }
  throw new Error("Could not retrieve video information");
}

// コメント情報を取得する関数
async function ggcomments(videoId) {
  const startTime = Date.now();
  if (!apis) {
    await getapis();
  }
  for (const instance of apis) {
    try {
      const response = await axios.get(`${instance}/api/v1/comments/${videoId}`, { timeout: MAX_API_WAIT_TIME });
      console.log(`Tried URL: ${instance}/api/v1/comments/${videoId}`);
      return response.data;
    } catch (error) {
      console.error(`Error at ${instance}: ${error.message}`);
    }
    if (Date.now() - startTime >= MAX_TIME) {
      throw new Error("Connection timed out");
    }
  }
  throw new Error("Could not retrieve comments");
}

// チャンネル情報を取得する関数
async function ggchannel(channelId) {
  const startTime = Date.now();
  if (!apis) {
    await getapis();
  }
  for (const instance of apis) {
    try {
      const response = await axios.get(`${instance}/api/v1/channels/${channelId}`, { timeout: MAX_API_WAIT_TIME });
      console.log(`Tried URL: ${instance}/api/v1/channels/${channelId}`);
      if (response.data) {
        return response.data;
      } else {
        console.error(`Channel data missing at: ${instance}`);
      }
    } catch (error) {
      console.error(`Error at ${instance}: ${error.message}`);
    }
    if (Date.now() - startTime >= MAX_TIME) {
      throw new Error("Connection timed out");
    }
  }
  throw new Error("Could not retrieve channel information");
}

// 取得済みのAPI一覧を返すルート
app.get('/api', (req, res) => {
  if (apis) {
    res.json(apis);
  } else {
    res.status(500).send('Oops, something went wrong.');
  }
});

// API一覧を再読み込みするルート
app.get('/return', async (req, res) => {
  await getapis();
  res.send("APIs refreshed.");
});

// 動画情報を返すルート
app.get('/api/video/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const videoInfo = await ggvideo(videoId);
    const formatStreams = videoInfo.formatStreams || [];
    const streamUrl = formatStreams.reverse().map(stream => stream.url)[0];
    const audioStreams = videoInfo.adaptiveFormats || [];
    
    // --- 変更箇所: 1080p固定ではなく、解像度の数値で降順ソートして一番高いものを取得 ---
    let highstreamUrl = audioStreams
      .filter(stream => stream.container === 'mp4' && stream.resolution)
      .sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution))
      .map(stream => stream.url)[0];
    // -----------------------------------------------------------------------------------

    const audioUrl = audioStreams
      .filter(stream => stream.container === 'm4a' && stream.audioQuality === 'AUDIO_QUALITY_MEDIUM')
      .map(stream => stream.url)[0];

    const templateData = {
      stream_url: streamUrl,
      highstreamUrl: highstreamUrl,
      audioUrl: audioUrl,
      videoId: videoId,
      channelId: videoInfo.authorId,
      channelName: videoInfo.author,
      channelImage: videoInfo.authorThumbnails?.[videoInfo.authorThumbnails.length - 1]?.url || '',
      videoTitle: videoInfo.title,
      videoDes: videoInfo.descriptionHtml,
      videoViews: videoInfo.viewCount,
      likeCount: videoInfo.likeCount
    };
    res.json(templateData);
  } catch (error) {
    res.status(500).render('matte', {
      videoId: videoId,
      error: 'Failed to retrieve video.',
      details: error.message
    });
  }
});

// コメント情報を返すルート
app.get('/api/comments/:id', async (req, res) => {
  const videoId = req.params.id;
  try {
    const commentsInfo = await ggcomments(videoId);
    res.json(commentsInfo);
  } catch (error) {
    res.status(500).render('matte', {
      videoId: videoId,
      error: 'Failed to retrieve comments.',
      details: error.message
    });
  }
});

// チャンネル情報を返す新しいルート
app.get('/api/channels/:id', async (req, res) => {
  const channelId = req.params.id;
  try {
    const channelInfo = await ggchannel(channelId);
    res.json(channelInfo);
  } catch (error) {
    res.status(500).render('matte', {
      channelId: channelId,
      error: 'Failed to retrieve channel information.',
      details: error.message
    });
  }
});

// サーバーの状態を返すルート
app.get('/status', (req, res) => {
  const startHR = process.hrtime();
  const currentTime = new Date();
  const uptime = process.uptime();

  const initialDiff = process.hrtime(startHR);
  const responseTimeMs = initialDiff[0] * 1e3 + initialDiff[1] / 1e6;

  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / (1024 * 1024);

  const cpuUsage = process.cpuUsage();
  const totalCpuMicro = cpuUsage.user + cpuUsage.system;

  let responseScore;
  if (responseTimeMs < 5) {
    responseScore = 100;
  } else if (responseTimeMs < 20) {
    responseScore = 80;
  } else if (responseTimeMs < 50) {
    responseScore = 60;
  } else {
    responseScore = 40;
  }

  let memoryScore;
  if (heapUsedMB < 100) {
    memoryScore = 100;
  } else if (heapUsedMB < 200) {
    memoryScore = 80;
  } else if (heapUsedMB < 300) {
    memoryScore = 60;
  } else {
    memoryScore = 40;
  }

  let cpuScore;
  if (totalCpuMicro < 100000) {
    cpuScore = 100;
  } else if (totalCpuMicro < 300000) {
    cpuScore = 80;
  } else if (totalCpuMicro < 500000) {
    cpuScore = 60;
  } else {
    cpuScore = 40;
  }

  const overallScore = Math.round((responseScore + memoryScore + cpuScore) / 3);
  let healthStatus;
  if (overallScore >= 90) {
    healthStatus = `Excellent (${overallScore}%)`;
  } else if (overallScore >= 70) {
    healthStatus = `Good (${overallScore}%)`;
  } else if (overallScore >= 50) {
    healthStatus = `Fair (${overallScore}%)`;
  } else {
    healthStatus = `Poor (${overallScore}%)`;
  }

  const apiStatus = apis ? "loaded" : "not loaded";

  const finalDiff = process.hrtime(startHR);
  const finalResponseTimeMs = finalDiff[0] * 1e3 + finalDiff[1] / 1e6;

  res.json({
    status: "OK",
    serverTime: currentTime,
    uptime: uptime,
    responseTime: finalResponseTimeMs,
    memoryUsage: {
      rss: memoryUsage.rss,
      heapTotal: memoryUsage.heapTotal,
      heapUsed: memoryUsage.heapUsed,
      external: memoryUsage.external,
    },
    cpuUsage: cpuUsage,
    apis: apiStatus,
    health: healthStatus
  });
});

// サーバー起動時にAPI一覧を読み込み
app.listen(PORT, async () => {
  console.log(`${PORT} - Server is running.`);
  await getapis();
});
