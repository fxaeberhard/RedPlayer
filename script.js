/**
 *
 * Todo:
 * + Warning if page closed with upload in progress
 * + Do not open
 * + Do not remove files that ended with errors
 * + Add js workers so playback will continue in sleep mode
 * + Add gain normalization
 * + Allow download from youtube
 */

Dropzone.autoDiscover = false;

jQuery(function($) {
    var songs, index, audio = new Audio(),
        categories = {}, // Holds song count for each category
        songHistory = [],
        songFuture = [],
        config = { // Holds config, stored in local storage
            categories: {},
            random: true,
            sort: 'name',
            name: ''
        };

    function init() {
        audio.onabort = function() {
            console.error('audio aborted', audio.src);
        };

        // Retrieve data from local storage
        config = JSON.parse(localStorage.getItem("config")) || config;
        $(window).unload(function() {
            localStorage.setItem("config", JSON.stringify(config));
        });

        // Retrieve data
        $.getJSON('songs.php', function(data) {

            renderSongs(data);

            if (window.location.hash) {
                var name = decodeURIComponent(window.location.hash.substr(1)),
                    targetIndex = _.findIndex(songs, function(song) {
                        return song.name === name;
                    });

                if (targetIndex) return loadSong(targetIndex);
            }
            // If no hash is present
            if (config.random) randomIndex();
            else loadSong(0);

        });

        // Buttons
        $('#play').click(togglePlay);
        $('#prev').click(prev);
        $('#next').click(next);
        $('#random').setClass(config.random, 'active')
            .click(function() {
                config.random = !config.random;
                $(this).toggleClass('active');
            });

        // Sort by button
        var sortDrop = new Drop({
            target: document.getElementById('sort'),
            content: function() {
                return '<button data-sort="name" class="' + (config.sort === 'name' ? 'active' : '') + '">Sort by genre</button>' + '<button data-sort="created" class="' + (config.sort === 'created' ? 'active' : '') + '">Sort by date added</button>';
            },
            position: 'bottom center',
            classes: 'drop-theme-arrows drop-menu',
        });

        $(document.body).on('click', '.drop-menu button', function(e) {
            sortDrop.close();
            config.sort = $(e.currentTarget).data('sort');
            renderSongs();
        });

        // Mobile menu  
        $('#menu').click(function() {
            $('#search, #categories').slideToggle();
            $(document.body).toggleClass("menu-toggled");
            setTimeout(function() {
                $(document.body).css('padding-top', $(document.body).hasClass('menu-toggled') ? $('header').height() : '');
            }, 410);
        });

        // Songs click
        var timer, ddtarget;
        $(document.body).on('click', 'ul li', function(e) {
                loadSong($(e.currentTarget).index());
            })
            // Show hide category
            .on('click', '#categories button', function() {
                config.categories[$(this).text()] = !config.categories[$(this).text()] || false;
                $(this).toggleClass('active');
                filter();
            })
            // Keyboard shortcuts
            .on('keydown', function(e) {
                if ($(e.target).is('input') || $(e.target).is('textarea')) {
                    if (e.keyCode === 27) {
                        $(e.target).blur();
                    }
                    return;
                }
                var keys = {
                    32: togglePlay,
                    37: prev,
                    39: next,
                    // j: search
                    74: function() {
                        $('#search input').focus().select();
                    },
                    191: function() {
                        $(document.body).toggleClass('advanced');
                    }
                };
                if (keys[e.keyCode]) {
                    keys[e.keyCode]();
                    return false;
                }
            })
            // Delete song
            .on('click', 'ul li .fa-trash', function(e) {
                e.stopPropagation();
                var li = $(e.target).closest('li'),
                    song = songs.splice(li.index(), 1);

                $(e.target).closest('li').tipso('hide').remove();

                $.ajax({
                    url: 'songs.php',
                    method: 'post',
                    data: { op: 'remove', 'path': song[0].mfilename }
                });
            })
            // Edit song
            .on('click', 'ul li .fa-edit, ul li.active .name', function(e) {
                e.stopImmediatePropagation();
                var $li = $(this).closest('li'),
                    song = songs[$li.index()],
                    $el = $li.find('.name'),
                    form = $('<form class="inline-form"><input></form'),
                    input = form.find('input').val(song.name);

                $el.empty().addClass('editing').append(form);
                input.focus().select();
                //on blur write everything back
                form.one('submit', function(e) {
                    e.preventDefault();
                    var text = input.val(),
                        newPath = song.dir + '/' + text + song.ext;

                    $.ajax({
                        url: 'songs.php',
                        method: 'post',
                        data: { op: 'rename', 'old': song.mfilename, 'new': newPath }
                    });

                    song.name = text;
                    song.mfilename = newPath;

                    form.remove();
                    $el.removeClass('editing').html(song.name);
                });
                input.click(function(e) {
                        e.stopImmediatePropagation();
                    })
                    .blur($.proxy(form.submit, form));
            })
            // Move song
            .on('click', 'ul li .fa-caret-down', function(e) {
                e.stopImmediatePropagation();
                if (timer) clearTimeout(timer);
                ddtarget = $(this);
                $('#ddmenu').show().offset({ top: $(this).offset().top + $(this).outerHeight(), left: $(this).offset().left - $('#ddmenu').outerWidth() + $(this).width() });
            })
            .on('mouseleave', 'ul li .fa-caret-down', hideDD);

        $(document.body).click(function() {
            $('.inline-form').submit();
        });

        // Move song menu
        $("#ddmenu").mouseenter(function() {
                if (timer) clearTimeout(timer);
                $(this).show();
            })
            .mouseleave(hideDD)
            .on('click', '> div', function() {
                var $li = ddtarget.closest('li'),
                    song = songs[$li.index()],
                    newDir = $(this).text(),
                    newPath = song.mfilename.replace(song.dir, newDir);

                $.ajax({
                    url: 'songs.php',
                    method: 'post',
                    data: { op: 'rename', 'old': song.mfilename, 'new': newPath }
                });
                song.mfilename = newPath;
                song.dir = newDir;
                $(this).parent().hide();
            });

        function hideDD() {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function() {
                $('#ddmenu').hide();
            }, 300);
        }

        initAudio();
        initDropzone();
        initSearch();
        initChat();
    }

    function reloadSongs() {
        $.getJSON('songs.php', renderSongs);
    }

    function renderSongs(newSongs) {
        if (!newSongs) {
            newSongs = window.oSongs;
        } else {
            window.oSongs = newSongs;
        }

        songs = window.songs = _.clone(newSongs);

        if (config.sort !== 'name') {
            var sortFn = {
                created: function(s1, s2) {
                    return s2.modified - s1.modified;
                }
            }
            songs = window.songs = songs.sort(sortFn.created);
            // sortedSongs.sort(sortFn[config.sort]);
        }

        categories = {};

        $('.tipso_style').tipso('hide').tipso('destroy');

        $('ul').empty().append($.map(songs, function(song) {
                var spl = song.mfilename.split('/'),
                    file = spl.pop();

                song.name = file.replace(/\.[^.]*$/, '');
                song.dir = spl.join('/');
                song.categories = [spl[0]];
                song.ext = file.replace(song.name, '');

                // if (song.artist) song.name = song.artist + " - " + song.title;

                categories[spl[0]] = categories[spl[0]] + 1 || 1;

                return '<li><div class="name">' + song.name + '</div><div class="buttons"><i class="fa fa-edit" aria-hidden="true"></i><i class="fa fa-caret-down" aria-hidden="true"></i><a href="' + song.mfilename +
                    '" target="_blank"><i class="fa fa-download" aria-hidden="true"></i></a><i class="fa fa-trash" aria-hidden="true"></i></div></li>';
            }).join(''))
            .find('li').tipso({
                background: '#19EE06',
                position: 'bottom',
                // hideDelay: 3000,
                onBeforeShow: function(el, tt, tipso) {

                    $('.tipso_style').tipso('hide');

                    if (this.content) return;

                    var song = songs[el.index()];

                    $.ajax({
                        url: 'songs.php',
                        method: 'post',
                        dataType: 'json',
                        data: { op: 'info', 'path': song.mfilename }
                    }).done(function(song) {
                        var tt =
                            // (song.artist || '') + " " + (song.title || '') + " " + (song.composer || '') + " " + (song.album || '') + '<br />' + 
                            "" + song.playtime + " " + song.filesize.formatFilesize() + ' ' +
                            Math.round(song.bitrate / 1000) + 'kbps ' + song.bitrate_mode + ' ' +
                            song.sample_rate / 1000 + 'KHz ' + (song.channels === "0" ? 'mono' : 'stereo');
                        el.tipso('update', 'content', tt);
                        tipso.tipso_bubble.find('.tipso_content').html(tt);
                    });
                }
            });

        initCategories();

        // Add tooltips
        $('[title]').tipso({ useTitle: true, background: '#19EE06' });

        filter();
    }

    function initCategories() {

        categories = _.sortKeysBy(categories);

        $('#ddmenu').empty().append($.map(categories, function(o, k) {
            return '<div>' + k + '</div>';
        }).join(''));

        // Render categories in top bar
        $('#categories').empty().append($.map(categories, function(o, k) {
            return '<button class="' + (config.categories[k] ? '' : 'active') + '" title="' + o + ' tracks" data-category="' + k + '">' + k + '</button>';
        }).join(''));

        // Render categories in drop zone
        $('#dropzone-target > div').empty().append($.map(categories, function(o, k) {
            return '<div>' + k + '</div>';
        }).join('') + '<div class="new-category"><i class="fa fa-plus-circle fa-2x"></i> &nbsp;New genre</div>');
    }

    function initDropzone() {
        var target, dragging, cdone, counter = 0;

        var dropzone = new Dropzone('body', {
            url: 'songs.php',
            previewsContainer: '#dropzone-preview',
            clickable: '#upload',
            acceptedFiles: 'audio/*',
            accept: function(file, done) {
                if (dragging) {
                    if (target) done();
                    else {
                        dropzone.removeFile(file);
                        done('error');
                    }
                } else {
                    cdone = done;
                    $('#dropzone-target').css('display', 'table');
                }
            }
        });

        dropzone.on('sending', function(file, req, form) {
                form.append('op', 'upload');
                if ($(target).is('.new-category')) {
                    form.append('dir', prompt('New genre name?'));
                } else {
                    form.append('dir', $(target).text());
                }
            })
            .on('complete', function(file) {
                setTimeout(function() {
                    if (file.accepted && file.status === "success")
                        $(file.previewElement).fadeOut(400, function() {
                            dropzone.removeFile(file);
                        });
                }, 3000);
                reloadSongs();
            })
            // .on('addedfile', function() {})
            .on('dragenter', function(id, e) {
                counter++;
                if (!containsFiles(e || id)) return;
                target = null;
                dragging = true;
                $('#dropzone-target').css('display', 'table');
            })
            .on('dragleave', function(e, id) {
                // if (!containsFiles(e || id)) return;
                counter--;
                if (counter === 0) {
                    $('#dropzone-target').hide();
                    setTimeout(function() {
                        dragging = false;
                    }, 200);
                }
            });

        $(document.body)
            .on('dragstop dragend drop mouseup', function() {
                $('#dropzone-target').hide();
                $('#dropzone-target > div > div').css('opacity', '');
            })
            .on('dragenter', '#dropzone-target > div > div', function(e) {
                $(e.target).css('opacity', 1);
                target = e.target;
            })
            .on('dragleave', '#dropzone-target > div > div', function(e) {
                $(e.target).css('opacity', '');
                if (target == e.target) target = null;
            })
            .on('click', '#dropzone-target > div > div', function(e) {
                $('#dropzone-target').hide();
                if (cdone) {
                    target = e.target;
                    cdone();
                    cdone = null;
                }
            });

        function containsFiles(event) {
            if (event.dataTransfer.types) {
                for (var i = 0; i < event.dataTransfer.types.length; i++) {
                    if (event.dataTransfer.types[i] == 'Files') {
                        return true;
                    }
                }
            }
            return false;
        }
    }

    function initAudio() {
        var duration, onplayhead;

        $(audio).on('ended', next)
            .on('canplaythrough', function() {
                duration = this.duration;
            })
            .on('progress', function() {
                try {
                    var bufferedEnd = audio.buffered.end(audio.buffered.length - 1),
                        duration = audio.duration;
                    if (duration > 0) {
                        $('> div:last-child', '#timeline').css('width', ((bufferedEnd / duration) * 100) + '%');
                    }
                } catch (e) {}
            })
            .on('timeupdate', function timeUpdate() {
                if (onplayhead) return;
                var playPercent = 100 * (this.currentTime / duration);
                $('> div:first-child', '#timeline').css('width', playPercent + '%');
                $('#time').text(this.currentTime.toMMSS());
            });

        //Makes timeline clickable
        $('#timeline').on('mousedown', function() {
            onplayhead = true;
            $(window).on('mousemove', moveplayhead);
        });
        $(window).on('mouseup', function(e) {
            if (onplayhead) {
                moveplayhead(e);
                $(window).off('mousemove');
                // change current time
                audio.currentTime = duration * (e.pageX - $('#timeline').offset().left) / $('#timeline').width();
            }
            onplayhead = false;
        });

        function moveplayhead(e) {
            e.stopImmediatePropagation();
            var newMargLeft = e.pageX - $('#timeline').offset().left,
                timelineWidth = $('#timeline').width();

            if (newMargLeft >= 0 && newMargLeft <= timelineWidth) {
                $('> div:first-child', '#timeline').css('width', newMargLeft + 'px');
            }
            if (newMargLeft < 0) {
                $('> div:first-child', '#timeline').css('width', '0px');
            }
            if (newMargLeft > timelineWidth) {
                $('> div:first-child', '#timeline').css('width', '100%');
            }
        }
    }

    function initSearch() {
        $('#search input')
            // .on('input change', throttle(filter, 200))
            .click(function(e) {
                if ($(this).is(':focus')) {
                    $(this).select();
                    e.preventDefault();
                }
            });

        var substringMatcher = function(q, cb) {
            // regex used to determine if a string contains the substring `q`
            var reg = q.split(' ').map(function(t) {
                    return '(?=.*' + t + ')';
                }).join(''),
                substrRegex = new RegExp(reg, 'i');
            // iterate through the pool of strings and for any string that contains the substring `q`, add it to the `matches` array
            cb($.map(songs, function(s) {
                if (substrRegex.test(s.name))
                    return s;
            }));
        };

        $('header input').typeahead({
                hint: true,
                highlight: true,
                minLength: 1
            }, {
                limit: 25,
                source: substringMatcher,
                display: function(s) {
                    return s.name;
                },
                templates: {
                    suggestion: function(data) {
                        return '<div class="suggestion">' + data.name + '</div>';
                    }
                }
            })
            .on('typeahead:autocomplete typeahead:select', function(e, o) {
                $('ul').children().eq(songs.indexOf(o)).click();
                $(this).typeahead('val', '');
            })
            .on('typeahead:render', function(e) {
                $('#search').find('.tt-selectable:first').addClass('tt-cursor');
            });
    }

    function loadSong(i) {
        try {
            songHistory.push(i);
            var wasPaused = audio && audio.paused,
                filename = songs[i].mfilename.split('/').pop(),
                name = songs[i].name;

            index = i;

            audio.src = songs[index].mfilename.replace(filename, encodeURIComponent(filename));
            audio.load();

            $('#title').text(name);
            $('ul .active').removeClass('active');
            $('ul li').eq(index).addClass('active').bringElIntoView();

            togglePlay(wasPaused);

            document.title = name;
            window.location.hash = encodeURIComponent(name);
            // window.history && history.pushState({}, songs[index].name, "/#1");
        } catch (e) {
            // Fail silently but show in F12 developer tools console
            if (window.console) console.error('Error:' + e, songs[i]);
        }
    }

    function togglePlay(doPlay) {
        try {
            if (doPlay === true || audio.paused) {
                var p = audio.play()
                    .catch(function(e) {
                        if (window.console) console.error('Play error:', audio.src, e);
                    });

                $('#play').addClass('playing');
            } else {
                audio.pause();
                $('#play').removeClass('playing');
            }
        } catch (e) {
            // Fail silently but show in F12 developer tools console
            if (window.console) console.error('Error:' + e);
        }
    }

    function randomIndex() {
        if (!$('ul li:not(.toggled)')[0]) return;
        var p;
        do {
            p = Math.round(Math.random() * (songs.length - 1));
        } while ($('ul li').eq(p).hasClass('toggled'));
        loadSong(p);
    }

    function prev() {
        if (!$('ul li:not(.toggled)')[0]) return;

        songFuture.push(songHistory.pop());
        var last = songHistory.pop();
        if (last) return loadSong(last);

        if (config.random) return randomIndex();

        var p = index;
        do {
            p = p === 0 ? songs.length - 1 : p - 1;
        } while ($('ul li').eq(p).hasClass('toggled'));
        loadSong(p);
    }

    function next() {
        if (!$('ul li:not(.toggled)')[0]) return;

        var next = songFuture.pop();
        if (next) return loadSong(next);

        if (config.random) return randomIndex();

        var p = index;
        do {
            p = (p + 1) % songs.length;
        } while ($('ul li').eq(p).hasClass('toggled'));
        loadSong(p);
    }

    function filter() {
        $('.tipso_style').tipso('hide');

        // var categories = $.map($('#categories button'), function(o) {
        //     return $(o).hasClass('active') ? $(o).data('category') : null;
        // });
        // search = $('#search input').val().toLowerCase(),

        $('ul li').each(function(i) {
            var item = songs[i],
                show = !config.categories[item.categories[0]];
            /*(!search || item.mfilename.toLowerCase().indexOf(search) > -1) &&*/

            $(this) /*.setSlide(show, 200)*/ .setClass(!show, 'toggled');
        });
    }

    /**
     * Chat panel
     */
    function initChat() {
        // When chat is opened
        $('#chatbutton').click(function() {
            $('body').toggleClass('chat-open');
            // Retrieve messages
            $.getJSON('chat.json', renderChat);
        });

        $('#chat #name').val(config.name);

        function renderChat(reply) {
            $('#chat #messages').empty().append($.map(reply.messages, function(m) {
                return '<div><label>' + (m.name || 'Anonymous') + ', ' + m.time.fromNow() + '</label><div>' + m.text + '</div></div>';
            }).join(''));
        }

        // Send message
        $('#chat button').click(function() {
            $.ajax({
                url: 'songs.php',
                method: 'post',
                data: { op: 'postchat', 'name': $('#chat #name').val(), 'text': $('#chat #text').val() },
                dataType: 'json'
            }).done(renderChat);
            config.name = $('#chat #name').val();
            $('#chat #text').val('');
            $('#chat button').prop('disabled', true);
        });

        $('#chat #name, #chat #text').on('keyup', function() {
            $('#chat button').prop('disabled', $('#chat #text').val() === '' || $('#chat #name').val() === '');
        });
    }

    $.fn.extend({
        toggleView: function(doShow, a, b) {
            if (doShow) return this.show(a, b);
            else return this.hide(a, b);
        },
        setSlide: function(doShow, duration) {
            if (doShow) this.slideDown(duration);
            else this.slideUp(duration);
            return this;
        },
        setClass: function(doShow, className) {
            if (doShow) this.addClass(className);
            else this.removeClass(className);
            return this;
        },
        bringElIntoView: function() {
                var elOffset = this.offset();
                var $window = $(window);
                var windowScrollBottom = $window.scrollTop() + $window.height();
                var scrollToPos = -1;
                var offsetTop = $('header').height();
                if (elOffset.top < $window.scrollTop() + offsetTop) // element is hidden in the top
                    scrollToPos = elOffset.top - offsetTop;
                else if (elOffset.top + this.height() > windowScrollBottom) // element is hidden in the bottom
                    scrollToPos = $window.scrollTop() + 8 + (elOffset.top + this.height() - windowScrollBottom);
                if (scrollToPos !== -1)
                    $('html, body').animate({ scrollTop: scrollToPos });
            }
            // shuffle: function() {
            //   var allElems = this.get(),
            //     getRandom = function(max) {
            //       return Math.floor(Math.random() * max);
            //     },
            //     shuffled = $.map(allElems, function() {
            //       var random = getRandom(allElems.length),
            //         randEl = $(allElems[random]).clone(true)[0];
            //       allElems.splice(random, 1);
            //       return randEl;
            //     });

        //   this.each(function(i) {
        //     $(this).replaceWith($(shuffled[i]));
        //   });
        //   return $(shuffled);
        // }
    });

    Number.prototype.toMMSS = function() {
        var seconds = Math.floor(this),
            hours = Math.floor(seconds / 3600);
        seconds -= hours * 3600;
        var minutes = Math.floor(seconds / 60);
        seconds -= minutes * 60;

        if (hours < 10) { hours = '0' + hours; }
        if (minutes < 10) { minutes = '0' + minutes; }
        if (seconds < 10) { seconds = '0' + seconds; }
        return /*hours + ':' +*/ minutes + ':' + seconds;
    };

    Number.prototype.formatFilesize = function() {
        var i = Math.floor(Math.log(this) / Math.log(1024));
        return (this / Math.pow(1024, i)).toFixed(2) * 1 + ['B', 'kB', 'MB', 'GB', 'TB'][i];
    };

    Number.prototype.fromNow = function() {
        var today = new Date(),
            diff = today.getTime() / 1000 - this;

        if (diff < 60 * 60) {
            return Math.round(diff / 60) + ' minutes ago';
        } else if (diff < 24 * 60 * 60) {
            return Math.round(diff / 60 / 60) + ' hours ago';
        } else if (diff < 30 * 24 * 60 * 60) {
            return Math.round(diff / 24 / 60 / 60) + ' days ago';
        } else {
            return new Date(this * 1000).toDateString();
        }
    }

    // function throttle(callback, limit) {
    //   var wait = false; // Initially, we're not waiting
    //   return function() { // We return a throttled function
    //     if (!wait) { // If we're not waiting
    //       callback.call(); // Execute users function
    //       wait = true; // Prevent future invocations
    //       setTimeout(function() { // After a period of time
    //         wait = false; // And allow future invocations
    //       }, limit);
    //     }
    //   };
    //}   

    // $.extend(Array.prototype, {
    //   clone: function() {
    //     return this.slice(0);
    //   },
    //   shuffle: function() {
    //     var currentIndex = this.length,
    //       temporaryValue, randomIndex;
    //     // While there remain elements to shuffle...
    //     while (0 !== currentIndex) {
    //       // Pick a remaining element...
    //       randomIndex = Math.floor(Math.random() * currentIndex);
    //       currentIndex -= 1;
    //       // And swap it with the current element.
    //       temporaryValue = this[currentIndex];
    //       this[currentIndex] = this[randomIndex];
    //       this[randomIndex] = temporaryValue;
    //     }
    //     return this;
    //   }

    _.mixin({
        'sortKeysBy': function(obj, comparator) {
            var keys = _.sortBy(_.keys(obj), function(key) {
                return comparator ? comparator(obj[key], key) : key;
            });

            return _.zipObject(keys, _.map(keys, function(key) {
                return obj[key];
            }));
        }
    });

    init();

    window.songs = songs;
    window.normalized = function(songs) {
        return songs.map(function(i) {
            return i.toLowerCase().replace('official', '').replace('video', '').replace('with', '').replace('clip', '').replace('officiel', '').replace('soca', '').replace('socca', '')
                .replace('lyrics', '').replace('lyric', '').replace('hq', '').replace('full', '').replace('version', '')
                .replace('audio', '').replace('.mp3', '').replace(/[\[\]\(\)\{\}\-\._\+]/ig, '').replace(/.*\//, '').replace(/  */g, ' ').trim();
        });
    };
});
