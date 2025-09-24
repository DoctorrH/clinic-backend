// --- File: server.js (Nâng cấp: AI có thể đề xuất tạo và cập nhật) ---

// --- Giai đoạn 1: Nạp các "phụ tùng" ---
console.log("Bắt đầu khởi tạo server...");

try {
    const express = require('express');
    const path = require('path');
    const fetch = require('node-fetch');
    const cors = require('cors'); 
    require('dotenv').config(); 

    console.log("Tất cả thư viện đã được nạp thành công.");

    // --- Giai đoạn 2: Tạo ra máy chủ ---
    const app = express();
    app.use(cors()); 
    app.use(express.json({ limit: '5mb' }));
    app.use(express.static(path.join(__dirname, 'public')));


    // --- Giai đoạn 3: Lấy API Key ---
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error("!!! LỖI: Biến môi trường GEMINI_API_KEY chưa được thiết lập.");
        process.exit(1); 
    } else {
        console.log("API Key đã được nạp thành công.");
    }

    const geminiApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;

    // --- Giai đoạn 4: Tạo các "cánh cửa" API ---

    // CÁNH CỬA: Dành cho Trợ lý AI
    app.post('/api/assistant', async (req, res) => {
        console.log("Đã nhận được yêu cầu tại /api/assistant...");
        try {
            const { query, context } = req.body;
            if (!query) {
                return res.status(400).json({ message: "Câu hỏi không được để trống." });
            }

            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format

            const prompt = `Bạn là một trợ lý AI cho ứng dụng quản lý phòng khám. Nhiệm vụ của bạn là phân tích yêu cầu của người dùng và dữ liệu bệnh nhân (context) được cung cấp, sau đó trả về một đối tượng JSON DUY NHẤT để ứng dụng có thể thực hiện hành động.

            Hôm nay là ngày ${today}.

            **ĐỊNH DẠNG ĐẦU RA (OUTPUT FORMAT):**
            Bạn PHẢI trả lời bằng một trong ba định dạng JSON sau, tuân thủ \`responseSchema\`.

            1.  **Khi người dùng chỉ hỏi thông tin (ví dụ: "có bao nhiêu bệnh nhân?"):**
                Action là "query", response là câu trả lời dạng văn bản.
                
            2.  **Khi người dùng yêu cầu CẬP NHẬT thông tin (ví dụ: "cập nhật sdt cho A thành X"):**
                Action là "update", bạn phải xác định chính xác 'patientId', các trường cần cập nhật trong 'updates', và một câu 'response' tóm tắt hành động.

            3.  **Khi người dùng yêu cầu TẠO MỚI bệnh nhân (ví dụ: "thêm bệnh nhân B, sdt Y, năm sinh Z"):**
                Action là "create", bạn phải điền các thông tin được cung cấp vào 'updates' và một câu 'response' tóm tắt hành động. 'patientId' sẽ là null.

            **QUY TẮC QUAN TRỌNG:**
            -   **Tìm \`patientId\` (cho action 'update'):** Dựa vào tên hoặc thông tin trong câu hỏi, bạn PHẢI tìm chính xác \`id\` của bệnh nhân đó từ dữ liệu \`context\` và điền vào trường \`patientId\`. Nếu không tìm thấy hoặc không chắc chắn, hãy trả về \`action: "query"\` với câu trả lời giải thích.
            -   **Xác định \`updates\`:**
                -   Các trường có thể xử lý là: \`subject\`, \`name\`, \`yearOfBirth\`, \`phone\`, \`lastExamDate\` (định dạng YYYY-MM-DD), \`nextExamDate\` (định dạng YYYY-MM-DD), \`revisitDays\` (số), \`notes\`.
                -   Nếu người dùng nói "đánh dấu đã khám", hãy đặt \`lastExamDate\` thành ngày hôm nay. Nếu bệnh nhân có \`revisitDays\`, hãy tính toán và cập nhật \`nextExamDate\`.
                -   Với action 'create', nếu ngày khám không được chỉ định, hãy mặc định \`lastExamDate\` là hôm nay.
            -   **Luôn trả lời bằng JSON:** Không được thêm bất kỳ văn bản nào ngoài đối tượng JSON.

            **Dữ liệu bệnh nhân hiện tại (context):**
            ${JSON.stringify(context, null, 2)}

            **Yêu cầu của người dùng:** "${query}"`;
            
            const payload = {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            "action": { "type": "STRING", "enum": ["query", "update", "create"] },
                            "response": { "type": "STRING" },
                            "patientId": { "type": "STRING" },
                            "updates": { 
                                "type": "OBJECT",
                                "properties": {
                                    "subject": { "type": "STRING" },
                                    "name": { "type": "STRING" },
                                    "yearOfBirth": { "type": "NUMBER" },
                                    "phone": { "type": "STRING" },
                                    "lastExamDate": { "type": "STRING" },
                                    "nextExamDate": { "type": "STRING" },
                                    "revisitDays": { "type": "NUMBER" },
                                    "notes": { "type": "STRING" }
                                },
                                "nullable": true
                            }
                        },
                        "required": ["action", "response"]
                    }
                }
            };

            const geminiResponse = await fetch(geminiApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const responseTextRaw = await geminiResponse.text();
            if (!geminiResponse.ok) {
                console.error(`Lỗi từ Gemini API (status ${geminiResponse.status}):`, responseTextRaw);
                throw new Error(`Lỗi từ Gemini API: ${geminiResponse.statusText}`);
            }
            if (!responseTextRaw) {
                console.warn("Gemini API trả về một phản hồi trống, có thể do bộ lọc an toàn.");
                return res.status(200).json({ action: "query", response: "Tôi không thể xử lý yêu cầu này do có thể vi phạm chính sách nội dung." });
            }

            let result;
            try {
                result = JSON.parse(responseTextRaw);
                const potentialResult = result.candidates?.[0]?.content?.parts?.[0]?.text;
                if(potentialResult) {
                    result = JSON.parse(potentialResult);
                }
            } catch (e) {
                console.error("Không thể phân tích JSON từ phản hồi của Gemini:", responseTextRaw);
                throw new Error("Phản hồi của AI có định dạng không hợp lệ.");
            }
            
            console.log("Trợ lý AI đã xử lý xong, đề xuất hành động:", result.action);
            res.status(200).json(result);

        } catch (error) {
            console.error('Lỗi trong quá trình xử lý của trợ lý AI:', error);
            res.status(500).json({ message: error.message || 'Đã có lỗi xảy ra phía máy chủ' });
        }
    });

    // --- Giai đoạn 5: Khởi động máy chủ ---
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`>>> Máy chủ trung gian đang lắng nghe tại cổng ${PORT}`);
    });

} catch (e) {
    console.error("!!! Lỗi khởi tạo server:", e);
}

