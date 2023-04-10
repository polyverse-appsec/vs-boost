#!/usr/bin/env perl

use strict;
use warnings;

use List::Util qw(first);

my @ARGV = @ARGV;

sub load_words {
    my ($file_path) = @_;
    open my $fh, '<', $file_path or die "Cannot open file '$file_path': $!";
    my @words = map { chomp; $_ } <$fh>;
    close $fh;
    return @words;
}

sub find_anagrams {
    my (@words) = @_;
    my %anagrams;
    foreach my $word (@words) {
        my $sorted_word = join("", sort split("", $word));
        push @{$anagrams{$sorted_word}}, $word;
    }
    return %anagrams;
}

sub print_anagrams {
    my (%anagrams) = @_;
    foreach my $sorted_word (keys %anagrams) {
        my @anagram_list = @{$anagrams{$sorted_word}};
        if (@anagram_list > 1) {
            print join(", ", @anagram_list), "\n";
        }
    }
}

if (@ARGV != 1) {
    die "Usage: $0 anagrams.txt\n";
}

my $file_path = shift @ARGV;
my @words = load_words($file_path);
my %anagrams = find_anagrams(@words);
print_anagrams(%anagrams);
