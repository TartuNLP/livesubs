// Global UI elements:
//  - log: event log
//  - trans: transcription window

// Global objects:
//  - isConnected: true iff we are connected to a worker
//  - tt: simple structure for managing the list of hypotheses
//  - dictate: dictate object with control methods 'init', 'startListening', ...
//       and event callbacks onResults, onError, ...

var isMicrophoneInitialized = false;
var isConnected = false;
var numWorkersAvailable = 0;

var dictate = null;


function createDictate() {
    serverBaseUrl = "bark.phon.ioc.ee:8443/konverentsid/duplex-speech-api";

    dictate = new Dictate({
        server: "wss://" + serverBaseUrl + "/ws/speech",
        serverStatus: "wss://" + serverBaseUrl + "/ws/status",
        referenceHandler: "https://" + serverBaseUrl + "/dynamic/reference",
        recorderWorkerPath: "media/js/libs/dictate.js/lib/recorderWorker.js",

        onReadyForSpeech: function () {
            isConnected = true;
            __message("READY FOR SPEECH");
            $("#recbutton").addClass("playing");
            $("#helptext").html("Räägi");
        },

        onPartialResults: function (hypos) {
            raw = JSON.stringify(hypos);
            console.log('Raw: ' + raw);
            rawText = hypos[0].transcript;

            $('#trans-text').prepend(
                $('<div/>')
                    .attr("id", uniqeId())
                    .addClass("row sent-row")
                    .append(
                        $('<div/>')
                            .addClass("col-xs-6")
                            .text(rawText))
                    .append(
                        $('<div/>')
                            .addClass("col-xs-6")
                            .text(rawText))
            );
        },

        onResults: function (hypos) {
            raw = JSON.stringify(hypos);
            console.log('Raw: ' + raw);

        },

        onEndOfSpeech: function () {
            __message("END OF SPEECH");
            $("#playbutton").addClass("disabled");
        },

        onEndOfSession: function () {
            isConnected = false;
            __message("END OF SESSION");
            $("#recbutton").removeClass("playing");
            updateDisabledState();
            $("#button-toolbar").removeClass("hidden");
        },

        onServerStatus: function (json) {
            __serverStatus(json.num_workers_available);
            numWorkersAvailable = json.num_workers_available;
            updateDisabledState();
        },

        onError: function (code, data) {
            dictate.cancel();
            __error(code, data);
            // TODO: show error in the GUI
        },

        onEvent: function (code, data) {
            __message(code, data);
            if (code === 3 /* MSG_INIT_RECORDER */) {
                isMicrophoneInitialized = true;
                updateDisabledState();
            }
        },

        rafCallback: rafCallback,
        content_id: $("#content_id").html(),
        user_id: $("#user_id").html()
    });
}


function testClick() {
    $('#trans-text').prepend(
        $('<div/>')
            .attr("id", uniqeId())
            .addClass("row sent-row")
            .append(
                $('<div/>')
                    .addClass("col-xs-6")
                    .text("abc"))
            .append(
                $('<div/>')
                    .addClass("col-xs-6")
                    .text("abc"))
    );
}

var uniqeId = (function () {
    var i = 0;
    return function () {
        return 'row' + i++;
    }
})();

function capitaliseFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function updateDisabledState() {
    var disabled = false;
    var text = "Dikteerimiseks vajuta nuppu";
    if (!isMicrophoneInitialized) {
        disabled = true;
        text = "Mikrofon initsialiseerimata";
    } else if (isConnected) {
        disabled = false;
        text = "Räägi...";
    } else if (numWorkersAvailable == 0) {
        disabled = true;
        text = "Server ülekoormatud või rivist väljas";
    }
    if (disabled) {
        $("#recbutton").addClass("disabled");
        $("#helptext").html(text);
    } else {
        $("#recbutton").removeClass("disabled");
        $("#helptext").html(text);
    }
}

function getAverage(array) {
    var values = 0;
    var average;
    var length = array.length;
    // get all the frequency amplitudes
    for (var i = 0; i < length; i++) {
        values += array[i];
    }
    average = values / length;
    return average;
}

function rafCallback(time) {
    var requestAnimationFrame = window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame;
    requestAnimationFrame(rafCallback, this);
    if (isConnected) {
        var freqByteData = new Uint8Array(userSpeechAnalyser.frequencyBinCount);
        userSpeechAnalyser.getByteFrequencyData(freqByteData);
        var average = getAverage(freqByteData);
        $("#recbutton").css({"background-color": "rgba(255, 0, 0, " + Math.log(average) / Math.log(256) + " )"});
    } else {
        $("#recbutton").css({"background-color": "rgba(255, 0, 0, 0.0)"});
    }
}

// Private methods (called from the callbacks)
function __message(code, data) {
    //console.log("msg: " + code + ": " + (data || ''));
}

function __error(code, data) {
    console.log("ERR: " + code + ": " + (data || ''))
}

function __serverStatus(msg) {
    serverStatusBar.innerHTML = msg;
}


// Public methods (called from the GUI)
function toggleListening() {
    if (isConnected) {
        dictate.stopListening();
        $("#recbutton").addClass("disabled");
        $("#helptext").html("Oota..");
    } else {
        dictate.startListening();
    }
}

function cancel() {
    dictate.cancel();
}

function clearTranscription() {

}

function resetText() {
    clearTranscription();
    var new_uuid = uuid()
    $("#content_id").html(new_uuid);
    dictate.getConfig().content_id = new_uuid;
    $("#button-toolbar").addClass("hidden");
    $("#submitButton").addClass("disabled");
}

function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : r & 0x3 | 0x8;
        return v.toString(16);
    });
}

function bookmarkletReturnResult() {
    console.log($(window.parent.document.dictateTextField).val());
    console.log($("#trans").val());
    $(document.dictateTextField).val($("#trans").val());
}


$(document).ready(function () {
    $("#show_once_message").cookieBar({closeButton: '#show_once_message_close_button'});
    $("#content_id").html(uuid());
    user_id = $.cookie('dikteeri_user_uuid')
    if (!user_id) {
        user_id = uuid();
        $.cookie('dikteeri_user_uuid', user_id, {expires: 5 * 365, path: '/'});
    }
    $("#user_id").html(user_id);
    $("#trans").on('input', function () {
        $("#submitButton").removeClass("disabled");
    });
    createDictate();
    dictate.init();


});
