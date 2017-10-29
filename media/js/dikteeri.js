var translationCacheSize = 50;
var transConfidenceThreshold = -4.5;

var translationCache = new lru(translationCacheSize);
var cacheMisses = 0;
var totalQueries = 0;

var isMicrophoneInitialized = false;
var isConnected = false;
var numWorkersAvailable = 0;

var dictate = null;
var completedSents = [];
var currentSent = "";

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
            var rawText = hypos[0].transcript;
            console.debug("Partial results raw text: " + rawText);

            var newSents = parseToSents(rawText);
            var lastSent = newSents.pop();

            var firstInvalid = newSents.length;
            for (var i = 0; i < newSents.length; i++) {
                if ($.inArray(newSents[i], completedSents) === -1) {
                    firstInvalid = i;
                    console.debug("Found first new sentence: newSents[" + i + "] = " + newSents[i]);
                    break;
                }
            }

            var reallyNewSents = newSents.slice(firstInvalid);
            console.debug("All new sentences:");
            console.debug(reallyNewSents);

            currentSent = $.trim(lastSent);
            console.debug("Current sentence: ");
            console.debug(currentSent);

            console.debug("Completed sentences before change:");
            console.debug(completedSents);
            completedSents = completedSents.slice(0, firstInvalid); // remove invalidated sents
            completedSents = completedSents.concat(reallyNewSents); // add new sents
            console.debug("Removed " + (completedSents.length - firstInvalid) + " sentences, " +
                "added " + reallyNewSents.length + " new sentences. " +
                "Completed sentences now:");
            console.debug(completedSents);

            var transTextEl = $('#trans-text');
            var transWrap = $('#trans');
            var isScrolledToBottom = transWrap.scrollHeight - transWrap.clientHeight <= transWrap.scrollTop + 1;

            transTextEl.empty();

            completedSents.forEach(function (sent) {
                var rowId = uniqueId();

                transTextEl.append(
                    $('<div></div>')
                        .attr("id", "row" + rowId)
                        .addClass("row sent-row")
                        .append(
                            $('<div></div>')
                                .addClass("col-xs-6 src")
                                .text(sent))
                        .append(
                            $('<div></div>')
                                .addClass("col-xs-6 tgt" + rowId)
                                .text("..."))
                );

                translateAsync(sent, 'tgt' + rowId);
            });

            // current sentence (no translation)
            transTextEl.append(
                $('<div></div>')
                    .addClass("row sent-row")
                    .append(
                        $('<div></div>')
                            .addClass("col-xs-6")
                            .text(currentSent))
                    .append(
                        $('<div></div>')
                            .addClass("col-xs-6"))
            );

            if (isScrolledToBottom) {
                transWrap.scrollTop = transWrap.scrollHeight - transWrap.clientHeight;
            }
        },

        onResults: function (hypos) {
            var rawText = hypos[0].transcript;
            console.debug("Final results raw text: " + rawText);

            var newSents = parseToSents(rawText);
            console.debug("Parsed into sentences:");
            console.debug(newSents);

            var transWrap = $('#trans');
            var isScrolledToBottom = transWrap.scrollHeight - transWrap.clientHeight <= transWrap.scrollTop + 1;

            $('#trans-text').empty();
            completedSents = [];
            currentSent = "";

            newSents.forEach(function (sent) {
                var rowId = uniqueId();

                $('#complete-trans').append(
                    $('<div></div>')
                        .attr("id", "row" + rowId)
                        .addClass("row sent-row")
                        .append(
                            $('<div></div>')
                                .addClass("col-xs-6 src")
                                .text(sent))
                        .append(
                            $('<div></div>')
                                .addClass("col-xs-6 tgt" + rowId)
                                .text("..."))
                );

                translateAsync(sent, 'tgt' + rowId);
            });

            if (isScrolledToBottom) {
                transWrap.scrollTop = transWrap.scrollHeight - transWrap.clientHeight;
            }
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
    rawText = "abc. bla. ma";

    var cache = new lru(3);
    var a = cache.get(2);
    console.log("a: " + a);
    cache.set(1, 3);
    cache.set(100, 100);
    cache.set(200, 100);
    cache.set(300, 200);
    console.log(cache.get(1));
    console.log(cache.get(200));

}


function translateAsync(src, elementClassname) {
    console.debug("Translating: " + src);

    function successCallback(translation, qeString) {
        console.debug("qeString: " + qeString);
        var qeScore = parseFloat(qeString);
        console.debug("qeScore: " + qeScore);
        console.debug("qeScore(2): " + qeScore.toFixed(2));
        var el = $('.' + elementClassname);
        if (qeScore < transConfidenceThreshold) {
            el.addClass("low-quality");
        }

        var transWrap = $('#trans');
        var isScrolledToBottom = transWrap.scrollHeight - transWrap.clientHeight <= transWrap.scrollTop + 1;

        el.text(translation + " (" + qeScore.toFixed(2) + ")");

        if (isScrolledToBottom) {
            transWrap.scrollTop = transWrap.scrollHeight - transWrap.clientHeight;
        }
    }

    var cacheResult = translationCache.get(src);
    if (cacheResult !== undefined) {
        successCallback(cacheResult.tgt, cacheResult.qe);
        console.debug("Cache hit!");
    } else {
        console.debug("Cache miss!");
        cacheMisses++;
        $.ajax({
            type: "GET",
            url: "https://api.neurotolge.ee/v1.0/translate?src=" + encodeURIComponent(src) +
            "&auth=password&langpair=eten&qualityestimation=1",
            dataType: "json",
            success: function (data) {
                successCallback(data.tgt, data.qualityestimation);
                translationCache.set(src, Object.freeze({tgt: data.tgt, qe: data.qualityestimation}));
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.error(textStatus + ' | ' + errorThrown);
            }
        });
    }

    totalQueries++;
    if (totalQueries % 10 === 0) {
        console.info("================================");
        console.info("Cache miss rate: " + (cacheMisses / totalQueries * 100) + "%");
    }
}

function parseToSents(str) {
    console.debug("Parsing to sentences: " + str);
    str = $.trim(str);
    return str.match(/(.+?[.?!] |.+?$)/g).map(function (sent) {
        return $.trim(sent);
    });
}

var uniqueId = (function () {
    var i = 0;
    return function () {
        return i++;
    }
})();

function capitaliseFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function updateDisabledState() {
    var disabled = false;
    var text = "DIKTEERIMISEKS VAJUTA NUPPU";
    if (!isMicrophoneInitialized) {
        disabled = true;
        text = "MIKROFON INITSIALISEERIMATA";
    } else if (isConnected) {
        disabled = false;
        text = "RÄÄGI...";
    } else if (numWorkersAvailable === 0) {
        disabled = true;
        text = "SERVER ON HÕIVATUD, PALUN TULGE HILJEM TAGASI";
    }
    if (disabled) {
        $("#recbutton").addClass("disabled");
        $("#helptext").addClass("red").html(text);
    } else {
        $("#recbutton").removeClass("disabled");
        $("#helptext").removeClass("red").html(text);
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


// Public methods (called from the GUI)
function toggleListening() {
    if (isConnected) {
        dictate.stopListening();
        $("#recbutton").addClass("disabled");
        $("#helptext").html("OOTA..");
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
    var new_uuid = uuid();
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
    user_id = $.cookie('dikteeri_user_uuid');
    if (!user_id) {
        user_id = uuid();
        $.cookie('dikteeri_user_uuid', user_id, {expires: 5 * 365, path: '/'});
    }
    $("#user_id").html(user_id);
    createDictate();
    dictate.init();
});
