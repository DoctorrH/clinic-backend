// --- File: server.js ---

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

console.log("Bắt đầu khởi tạo server...");

const app = express();
app.use(cors());

// --- SỬA LỖI: Tăng giới hạn payload lên 50MB ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- SỬA LỖI: Phục vụ các tệp tĩnh từ thư mục gốc ---
// Lỗi "ENOENT: no such file or directory" xảy ra vì Render không tìm thấy
// thư mục 'public'. Chúng ta sẽ đơn giản hóa cấu trúc, yêu cầu tệp index.html
// nằm cùng cấp với server.js, và loại bỏ sự cần thiết của thư mục 'public'.
app.use(express.static(__dirname));


const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
    console.error("!!! LỖI QUAN TRỌNG: Biến môi trường GEMINI_API_KEY chưa được thiết lập.");
} else {
    console.log("API Key đã được nạp thành công.");
}

const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;


app.post('/api/assistant', async (req, res) => {
    console.log("Đã nhận được yêu cầu tại /api/assistant...");
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ message: "Lỗi phía máy chủ: API Key chưa được cấu hình." });
    }

    try {
        const { query, context } = req.body;
        if (!query) {
            return res.status(400).json({ message: "Câu hỏi không được để trống." });
        }
        const today = new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        const systemPrompt = `You are an intelligent and concise clinic data analysis assistant. Your name is Medly. You will receive a user's question and a JSON dataset of patients. Your task is to respond to the question BASED ONLY on the provided data. Today is ${today}.

        RULES:
        1.  Analyze the user's intent: Is it a query ('query'), an update request ('update'), or a creation request ('create')?
        2.  For a 'query', answer concisely. Use bullet points (-) for lists. If data is insufficient, state: "Dữ liệu hiện tại không đủ để trả lời câu hỏi này."
        3.  For 'update' or 'create' requests, identify the necessary data from the user's query.
        4.  You MUST respond in a specific JSON format. Do not add any text outside the JSON structure.
        5.  Always respond in Vietnamese.
        6.  For updates, you must find the correct patient 'id' from the context. If multiple patients match a name, ask for clarification. If no patient is found, state it in the 'response' field.
        7.  When creating a patient, 'name' is mandatory. Other fields are optional.
        
        JSON Response Format:
        {
          "response": "Your natural language answer for 'query' actions, or a confirmation/error message for 'update'/'create'.",
          "action": "query" | "update" | "create" | "clarify" | "error",
          "patientId": "The ID of the patient to update (for 'update' action only).",
          "updates": {
            "fieldName1": "newValue1",
            "fieldName2": "newValue2"
          }
        }
        
        Patient data fields: 'id', 'subject', 'name', 'yearOfBirth', 'phone', 'lastExamDate', 'nextExamDate', 'revisitDays', 'status', 'notes'.
        The 'id' is a unique alphanumeric string. Do NOT invent an ID.
        
        Current Patient Data:
        ${JSON.stringify(context, null, 2)}
        
        User's request: "${query}"`;
        
        const payload = {
            contents: [{ parts: [{ text: systemPrompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            }
        };

        const geminiResponse = await fetch(geminiApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorText = await geminiResponse.text();
            console.error("Lỗi từ Gemini API:", errorText);
            throw new Error(`Lỗi từ Gemini API: ${geminiResponse.statusText}`);
        }

        const result = await geminiResponse.json();
        const responseText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        console.log("Trợ lý AI đã xử lý xong. Phản hồi:", responseText);
        
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(responseText);

    } catch (error) {
        console.error('Lỗi trong quá trình xử lý của trợ lý AI:', error);
        res.status(500).json({
             "response": `Đã có lỗi xảy ra phía máy chủ khi xử lý yêu cầu của bạn. Chi tiết: ${error.message}`,
             "action": "error",
             "patientId": null,
             "updates": {}
        });
    }
});

// --- SỬA LỖI: Route mặc định để phục vụ index.html từ thư mục gốc ---
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Khởi động máy chủ
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`>>> Máy chủ đang lắng nghe tại cổng ${PORT}`);
});

